import React, { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { format } from 'date-fns';
import { Video, VideoOff, Mic, MicOff, PhoneOff, CalendarClock, Users, PlusCircle, PlayCircle, CheckCircle2, XCircle } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { useAuth } from '../../context/AuthContext';
import { api, getSocketServerUrl } from '../../lib/api';
import { Meeting, MeetingCreatePayload, UserRole } from '../../types';
import toast from 'react-hot-toast';

interface MeetingListResponse {
  meetings: Meeting[];
}

interface UsersListResponse {
  users: Array<{
    id: string;
    name: string;
    role: UserRole;
    avatarUrl: string;
    bio: string;
    location?: string;
    isOnline?: boolean;
  }>;
}

const toLocalDateTimeInputValue = (date: Date): string => {
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

export const MeetingsPage: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const roomIdRef = useRef<string>('');
  const isInitiatorRef = useRef(false);
  const offerSentRef = useRef(false);

  const [contacts, setContacts] = useState<UsersListResponse['users']>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [participantId, setParticipantId] = useState('');
  const [title, setTitle] = useState('Investor sync');
  const [agenda, setAgenda] = useState('Discuss timeline, milestones, and next steps.');
  const [startsAt, setStartsAt] = useState(toLocalDateTimeInputValue(new Date(Date.now() + 60 * 60 * 1000)));
  const [endsAt, setEndsAt] = useState(toLocalDateTimeInputValue(new Date(Date.now() + 90 * 60 * 1000)));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedMeetingId, setSelectedMeetingId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [callStatus, setCallStatus] = useState<'idle' | 'connecting' | 'connected' | 'in-call'>('idle');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [joinedParticipantCount, setJoinedParticipantCount] = useState(0);

  const selectedMeeting = useMemo(
    () => meetings.find((meeting) => meeting.id === selectedMeetingId) || null,
    [meetings, selectedMeetingId]
  );

  const upcomingMeetings = useMemo(
    () => meetings.filter((meeting) => meeting.status !== 'rejected').sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [meetings]
  );

  const loadMeetings = async () => {
    const response = await api.get<MeetingListResponse>('/meetings');
    setMeetings(response.data.meetings);

    if (!selectedMeetingId && response.data.meetings.length > 0) {
      setSelectedMeetingId(response.data.meetings[0].id);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      if (!user) {
        return;
      }

      const targetRole: UserRole = user.role === 'investor' ? 'entrepreneur' : 'investor';
      const [meetingResponse, usersResponse] = await Promise.all([
        api.get<MeetingListResponse>('/meetings'),
        api.get<UsersListResponse>(`/users?role=${targetRole}`),
      ]);

      setMeetings(meetingResponse.data.meetings);
      setContacts(usersResponse.data.users);

      if (meetingResponse.data.meetings.length > 0) {
        setSelectedMeetingId((current) => current || meetingResponse.data.meetings[0].id);
      }

      if (usersResponse.data.users.length > 0) {
        setParticipantId((current) => current || usersResponse.data.users[0].id);
      }
    };

    void loadData().catch((error) => {
      const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message || 'Unable to load meetings';
      toast.error(message);
    });
  }, [user]);

  const teardownCall = (shouldNotifyPeer = true) => {
    if (shouldNotifyPeer && socketRef.current && roomIdRef.current) {
      socketRef.current.emit('end-call', { roomId: roomIdRef.current });
    }

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;

    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;

    socketRef.current?.removeAllListeners();
    socketRef.current?.disconnect();
    socketRef.current = null;

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    roomIdRef.current = '';
    offerSentRef.current = false;
    isInitiatorRef.current = false;
    setRoomId('');
    setCallStatus('idle');
    setJoinedParticipantCount(0);
    setAudioEnabled(true);
    setVideoEnabled(true);
  };

  useEffect(() => {
    return () => {
      teardownCall(false);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const roomParam = queryParams.get('room');
    const audioOnlyParam = queryParams.get('audioOnly');

    if (roomParam) {
      setRoomId(roomParam);
      const requestVideo = audioOnlyParam !== 'true';
      setVideoEnabled(requestVideo);

      const timeoutId = setTimeout(() => {
        void joinCall(roomParam, requestVideo).catch((error) => {
          toast.error((error as Error).message || 'Unable to auto-join room');
        });
      }, 500);

      return () => clearTimeout(timeoutId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const attachLocalStream = async (requestVideo = true) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: requestVideo });
    localStreamRef.current = stream;

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }

    return stream;
  };

  const createPeerConnection = (socket: Socket, activeRoomId: string) => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
    });

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', { roomId: activeRoomId, candidate: event.candidate });
      }
    };

    peerConnection.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    localStreamRef.current?.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStreamRef.current as MediaStream);
    });

    peerConnectionRef.current = peerConnection;
    return peerConnection;
  };

  const joinCall = async (meetingRoomId = roomId.trim(), requestVideo = videoEnabled) => {
    if (!user) {
      return;
    }

    if (!meetingRoomId) {
      toast.error('Enter a meeting room ID or select a meeting first');
      return;
    }

    teardownCall(false);
    setCallStatus('connecting');
    setRoomId(meetingRoomId);
    roomIdRef.current = meetingRoomId;

    const socket = io(getSocketServerUrl(), {
      transports: ['websocket'],
      autoConnect: true,
    });

    socketRef.current = socket;

    const stream = await attachLocalStream(requestVideo);
    const peerConnection = createPeerConnection(socket, meetingRoomId);

    socket.on('room-joined', ({ participantCount }: { participantCount: number }) => {
      setJoinedParticipantCount(participantCount);
      isInitiatorRef.current = participantCount <= 1;
      setCallStatus('connected');
    });

    socket.on('peer-joined', async () => {
      if (!peerConnectionRef.current || offerSentRef.current || !isInitiatorRef.current) {
        return;
      }

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit('offer', { roomId: meetingRoomId, offer });
      offerSentRef.current = true;
      setCallStatus('in-call');
    });

    socket.on('offer', async ({ offer }: { offer: RTCSessionDescriptionInit }) => {
      if (!peerConnectionRef.current) {
        return;
      }

      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      socket.emit('answer', { roomId: meetingRoomId, answer });
      setCallStatus('in-call');
    });

    socket.on('answer', async ({ answer }: { answer: RTCSessionDescriptionInit }) => {
      if (!peerConnectionRef.current) {
        return;
      }

      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      setCallStatus('in-call');
    });

    socket.on('ice-candidate', async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      if (peerConnectionRef.current && candidate) {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    socket.on('peer-left', () => {
      toast('The other participant left the room');
      teardownCall(false);
    });

    socket.on('end-call', () => {
      toast('The call ended');
      teardownCall(false);
    });

    socket.emit('join-room', {
      roomId: meetingRoomId,
      userId: user.id,
      userName: user.name,
    });

    if (stream && peerConnection) {
      setCallStatus('connected');
    }
  };

  const handleScheduleMeeting = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!participantId) {
      toast.error('Pick a participant to schedule with');
      return;
    }

    setIsSubmitting(true);

    const payload: MeetingCreatePayload = {
      participantId,
      title,
      agenda,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
    };

    try {
      await api.post<{ meeting: Meeting }>('/meetings', payload);
      toast.success('Meeting scheduled');
      await loadMeetings();
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message || 'Unable to schedule meeting';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMeetingStatusChange = async (meetingId: string, action: 'accept' | 'reject') => {
    try {
      await api.patch(`/meetings/${meetingId}/${action}`);
      toast.success(action === 'accept' ? 'Meeting accepted' : 'Meeting rejected');
      await loadMeetings();
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message || 'Unable to update meeting';
      toast.error(message);
    }
  };

  const handleCancelMeeting = async (meetingId: string) => {
    try {
      await api.delete(`/meetings/${meetingId}`);
      toast.success('Meeting cancelled successfully');
      await loadMeetings();
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message || 'Unable to cancel meeting';
      toast.error(message);
    }
  };

  const toggleAudio = () => {
    const nextValue = !audioEnabled;
    setAudioEnabled(nextValue);

    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = nextValue;
    });

    socketRef.current?.emit('media-state', {
      roomId: roomIdRef.current,
      audioEnabled: nextValue,
      videoEnabled,
    });
  };

  const toggleVideo = () => {
    const nextValue = !videoEnabled;
    setVideoEnabled(nextValue);

    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = nextValue;
    });

    socketRef.current?.emit('media-state', {
      roomId: roomIdRef.current,
      audioEnabled,
      videoEnabled: nextValue,
    });
  };

  if (!user) {
    return null;
  }

  const meetingRoomLabel = selectedMeeting?.id || roomId || 'Select or create a meeting';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meetings</h1>
          <p className="text-gray-600">Schedule calls, accept invites, and start a live room from the same backend state.</p>
        </div>

        <div className="flex gap-2">
          <Badge variant="primary" rounded>
            <CalendarClock size={14} className="mr-1" />
            {upcomingMeetings.length} meetings
          </Badge>
          <Badge variant={callStatus === 'in-call' ? 'success' : 'gray'} rounded>
            {callStatus === 'in-call' ? 'Live call' : callStatus}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Schedule a meeting</h2>
                <p className="text-sm text-gray-500">The backend stores the event and blocks overlapping bookings for either participant.</p>
              </div>
              <Users size={18} className="text-gray-400" />
            </CardHeader>
            <CardBody>
              <form className="space-y-4" onSubmit={handleScheduleMeeting}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Participant</label>
                    <select
                      value={participantId}
                      onChange={(event) => setParticipantId(event.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
                    >
                      {contacts.map((contact) => (
                        <option key={contact.id} value={contact.id}>
                          {contact.name} {contact.role ? `(${contact.role})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <Input
                    label="Title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Intro call"
                    fullWidth
                  />
                </div>

                <Input
                  label="Agenda"
                  value={agenda}
                  onChange={(event) => setAgenda(event.target.value)}
                  placeholder="Discuss milestones, funding, or product roadmap"
                  fullWidth
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Starts at"
                    type="datetime-local"
                    value={startsAt}
                    onChange={(event) => setStartsAt(event.target.value)}
                    fullWidth
                  />
                  <Input
                    label="Ends at"
                    type="datetime-local"
                    value={endsAt}
                    onChange={(event) => setEndsAt(event.target.value)}
                    fullWidth
                  />
                </div>

                <Button type="submit" leftIcon={<PlusCircle size={18} />} isLoading={isSubmitting}>
                  Schedule meeting
                </Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Meetings calendar</h2>
                <p className="text-sm text-gray-500">Accepted meetings appear here and can be used to start a call room.</p>
              </div>
              <Badge variant="secondary">Sync ready</Badge>
            </CardHeader>
            <CardBody className="space-y-4">
              {upcomingMeetings.length > 0 ? (
                upcomingMeetings.map((meeting) => {
                  const counterpart = meeting.organizerId === user.id ? meeting.participant : meeting.organizer;
                  const isPendingForYou = meeting.status === 'pending' && meeting.participantId === user.id;

                  return (
                    <div
                      key={meeting.id}
                      className={`rounded-xl border p-4 transition-colors ${selectedMeetingId === meeting.id ? 'border-primary-300 bg-primary-50' : 'border-gray-200 bg-white'}`}
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="flex items-start gap-3">
                          <Avatar src={counterpart?.avatarUrl ?? ''} alt={counterpart?.name || 'Meeting participant'} size="md" />
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-semibold text-gray-900">{meeting.title}</h3>
                              <Badge variant={meeting.status === 'accepted' ? 'success' : meeting.status === 'pending' ? 'warning' : 'error'}>{meeting.status}</Badge>
                            </div>
                            <p className="text-sm text-gray-600">With {counterpart?.name || 'Meeting participant'}</p>
                            <p className="mt-1 text-sm text-gray-500">{meeting.agenda}</p>
                            <p className="mt-2 text-xs text-gray-500">
                              {format(new Date(meeting.startsAt), 'PPpp')} - {format(new Date(meeting.endsAt), 'p')}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<PlayCircle size={16} />}
                            onClick={() => {
                              setSelectedMeetingId(meeting.id);
                              setRoomId(meeting.id);
                            }}
                          >
                            Use room
                          </Button>

                          <Button
                            size="sm"
                            leftIcon={<Video size={16} />}
                            onClick={() => {
                              setSelectedMeetingId(meeting.id);
                              void joinCall(meeting.id).catch((error) => {
                                const message = (error as Error).message || 'Unable to start call';
                                toast.error(message);
                              });
                            }}
                          >
                            Join call
                          </Button>

                          {isPendingForYou && (
                            <>
                              <Button
                                variant="success"
                                size="sm"
                                leftIcon={<CheckCircle2 size={16} />}
                                onClick={() => void handleMeetingStatusChange(meeting.id, 'accept')}
                              >
                                Accept
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                leftIcon={<XCircle size={16} />}
                                onClick={() => void handleMeetingStatusChange(meeting.id, 'reject')}
                              >
                                Reject
                              </Button>
                            </>
                          )}

                          <Button
                            variant="error"
                            size="sm"
                            leftIcon={<XCircle size={16} />}
                            onClick={() => void handleCancelMeeting(meeting.id)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-xl border border-dashed border-gray-300 px-6 py-10 text-center">
                  <CalendarClock size={28} className="mx-auto text-gray-400" />
                  <h3 className="mt-3 text-base font-semibold text-gray-900">No meetings yet</h3>
                  <p className="mt-1 text-sm text-gray-500">Create one above and it will appear here with backend conflict protection.</p>
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Video room</h2>
                <p className="text-sm text-gray-500">Join room {meetingRoomLabel} using the Socket.IO signaling server.</p>
              </div>
              <Video size={18} className="text-gray-400" />
            </CardHeader>

            <CardBody className="space-y-4">
              <Input
                label="Room ID"
                value={roomId}
                onChange={(event) => setRoomId(event.target.value)}
                placeholder="meeting-room-id"
                fullWidth
              />

              <div className="flex flex-wrap gap-2">
                <Button
                  leftIcon={<PlayCircle size={18} />}
                  onClick={() => void joinCall().catch((error) => toast.error((error as Error).message || 'Unable to join room'))}
                >
                  Join room
                </Button>

                <Button variant="outline" leftIcon={audioEnabled ? <Mic size={18} /> : <MicOff size={18} />} onClick={toggleAudio} disabled={callStatus === 'idle'}>
                  {audioEnabled ? 'Mute audio' : 'Unmute audio'}
                </Button>

                <Button variant="outline" leftIcon={videoEnabled ? <Video size={18} /> : <VideoOff size={18} />} onClick={toggleVideo} disabled={callStatus === 'idle'}>
                  {videoEnabled ? 'Stop video' : 'Start video'}
                </Button>

                <Button variant="error" leftIcon={<PhoneOff size={18} />} onClick={() => teardownCall()} disabled={callStatus === 'idle'}>
                  End call
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl border border-gray-200 bg-gray-950 overflow-hidden">
                  <div className="border-b border-gray-800 px-3 py-2 text-xs font-medium text-gray-300">Local</div>
                  <video ref={localVideoRef} autoPlay muted playsInline className="h-56 w-full object-cover bg-black" />
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-950 overflow-hidden">
                  <div className="border-b border-gray-800 px-3 py-2 text-xs font-medium text-gray-300">Remote</div>
                  <video ref={remoteVideoRef} autoPlay playsInline className="h-56 w-full object-cover bg-black" />
                </div>
              </div>

              <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600 space-y-1">
                <p>Room status: <span className="font-medium text-gray-900">{callStatus}</span></p>
                <p>Participants seen by server: <span className="font-medium text-gray-900">{joinedParticipantCount}</span></p>
                <p>Selected meeting: <span className="font-medium text-gray-900">{selectedMeeting?.title || 'None selected'}</span></p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900">Calendar sync</h2>
            </CardHeader>
            <CardBody className="space-y-3 text-sm text-gray-600">
              <p>Meeting records are returned from the backend as ISO timestamps, so a calendar component can render them without extra mapping.</p>
              <p>The current page already uses that structure directly, so plugging in a calendar library later only needs the same `Meeting` shape.</p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
};