import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Send, Phone, Video, Info, Smile } from 'lucide-react';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ChatMessage } from '../../components/chat/ChatMessage';
import { ChatUserList } from '../../components/chat/ChatUserList';
import { useAuth } from '../../context/AuthContext';
import { ChatConversation, Message, AppUser } from '../../types';
import { findUserById } from '../../data/users';
import { MessageCircle } from 'lucide-react';
import { api } from '../../lib/api';
import toast from 'react-hot-toast';

export const ChatPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [chatPartner, setChatPartner] = useState<AppUser | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  const loadConversations = async () => {
    if (currentUser) {
      try {
        const response = await api.get<{ conversations: ChatConversation[] }>('/messages/conversations');
        setConversations(response.data.conversations);
      } catch (error) {
        console.error('Failed to load conversations', error);
      }
    }
  };

  const loadMessages = async () => {
    if (currentUser && userId) {
      try {
        const response = await api.get<{ messages: Message[] }>(`/messages/${userId}`);
        setMessages(response.data.messages);
      } catch (error) {
        console.error('Failed to load messages', error);
      }
    }
  };

  useEffect(() => {
    const fetchPartner = async () => {
      if (userId) {
        try {
          const response = await api.get<AppUser>(`/users/${userId}`);
          setChatPartner(response.data);
        } catch {
          // Fallback to local mock data if user is not in backend yet
          setChatPartner(findUserById(userId));
        }
      } else {
        setChatPartner(null);
      }
    };
    void fetchPartner();
  }, [userId]);

  useEffect(() => {
    void loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  useEffect(() => {
    void loadMessages();

    // Poll for new messages every 3 seconds to keep chat active
    const interval = setInterval(() => {
      void loadMessages();
    }, 3000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, userId]);

  useEffect(() => {
    // Scroll to bottom of messages
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newMessage.trim() || !currentUser || !userId) return;

    try {
      const response = await api.post<{ message: Message }>('/messages', {
        receiverId: userId,
        content: newMessage.trim(),
      });

      setMessages((prev) => [...prev, response.data.message]);
      setNewMessage('');
      void loadConversations();
    } catch {
      toast.error('Failed to send message');
    }
  };

  const startVideoCall = () => {
    if (currentUser && userId) {
      const roomId = `conv-${currentUser.id}-${userId}`;
      navigate(`/meetings?room=${roomId}`);
    }
  };

  const startVoiceCall = () => {
    if (currentUser && userId) {
      const roomId = `conv-${currentUser.id}-${userId}`;
      navigate(`/meetings?room=${roomId}&audioOnly=true`);
    }
  };

  if (!currentUser) return null;

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-white border border-gray-200 rounded-lg overflow-hidden animate-fade-in">
      {/* Conversations sidebar */}
      <div className="hidden md:block w-1/3 lg:w-1/4 border-r border-gray-200">
        <ChatUserList conversations={conversations} />
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat header */}
        {chatPartner ? (
          <>
            <div className="border-b border-gray-200 p-4 flex justify-between items-center">
              <div className="flex items-center">
                <Avatar
                  src={chatPartner.avatarUrl}
                  alt={chatPartner.name}
                  size="md"
                  status={chatPartner.isOnline ? 'online' : 'offline'}
                  className="mr-3"
                />

                <div>
                  <h2 className="text-lg font-medium text-gray-900">{chatPartner.name}</h2>
                  <p className="text-sm text-gray-500">
                    {chatPartner.isOnline ? 'Online' : 'Last seen recently'}
                  </p>
                </div>
              </div>

              <div className="flex space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full p-2"
                  aria-label="Voice call"
                  onClick={startVoiceCall}
                >
                  <Phone size={18} />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full p-2"
                  aria-label="Video call"
                  onClick={startVideoCall}
                >
                  <Video size={18} />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  className={`rounded-full p-2 ${showInfo ? 'bg-primary-50 text-primary-600' : ''}`}
                  aria-label="Info"
                  onClick={() => setShowInfo(!showInfo)}
                >
                  <Info size={18} />
                </Button>
              </div>
            </div>

            {/* Messages container */}
            <div className="flex-1 p-4 overflow-y-auto bg-gray-50">
              {messages.length > 0 ? (
                <div className="space-y-4">
                  {messages.map((message) => (
                    <ChatMessage
                      key={message.id}
                      message={message}
                      isCurrentUser={message.senderId === currentUser.id}
                    />
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center">
                  <div className="bg-gray-100 p-4 rounded-full mb-4">
                    <MessageCircle size={32} className="text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-700">No messages yet</h3>
                  <p className="text-gray-500 mt-1">Send a message to start the conversation</p>
                </div>
              )}
            </div>

            {/* Message input */}
            <div className="border-t border-gray-200 p-4">
              <form onSubmit={handleSendMessage} className="flex space-x-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-full p-2"
                  aria-label="Add emoji"
                >
                  <Smile size={20} />
                </Button>

                <Input
                  type="text"
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  fullWidth
                  className="flex-1"
                />

                <Button
                  type="submit"
                  size="sm"
                  disabled={!newMessage.trim()}
                  className="rounded-full p-2 w-10 h-10 flex items-center justify-center"
                  aria-label="Send message"
                >
                  <Send size={18} />
                </Button>
              </form>
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-4">
            <div className="bg-gray-100 p-6 rounded-full mb-4">
              <MessageCircle size={48} className="text-gray-400" />
            </div>
            <h2 className="text-xl font-medium text-gray-700">Select a conversation</h2>
            <p className="text-gray-500 mt-2 text-center">
              Choose a contact from the list to start chatting
            </p>
          </div>
        )}
      </div>

      {/* Collapsible Info panel */}
      {showInfo && chatPartner && (
        <div className="w-80 border-l border-gray-200 bg-white flex flex-col overflow-y-auto animate-fade-in">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 flex-shrink-0">
            <h3 className="font-semibold text-gray-900">User Information</h3>
            <button
              onClick={() => setShowInfo(false)}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
            >
              ✕
            </button>
          </div>

          {/* User profile image, name, role */}
          <div className="p-6 flex flex-col items-center border-b border-gray-200 flex-shrink-0">
            <Avatar
              src={chatPartner.avatarUrl}
              alt={chatPartner.name}
              size="xl"
              status={chatPartner.isOnline ? 'online' : 'offline'}
            />
            <h4 className="mt-3 text-lg font-bold text-gray-900">{chatPartner.name}</h4>
            <p className="text-sm font-medium text-primary-600 capitalize mt-1">{chatPartner.role}</p>
            {chatPartner.location && (
              <p className="text-xs text-gray-500 mt-1">{chatPartner.location}</p>
            )}
          </div>

          {/* Details */}
          <div className="p-6 space-y-4">
            <div>
              <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Bio</h5>
              <p className="mt-1 text-sm text-gray-600 leading-relaxed">{chatPartner.bio || 'No bio provided.'}</p>
            </div>

            {chatPartner.role === 'entrepreneur' ? (
              <>
                {chatPartner.startupName && (
                  <div>
                    <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Startup</h5>
                    <p className="mt-1 text-sm font-medium text-gray-900">{chatPartner.startupName}</p>
                  </div>
                )}
                {chatPartner.pitchSummary && (
                  <div>
                    <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Pitch Summary</h5>
                    <p className="mt-1 text-sm text-gray-600 leading-relaxed">{chatPartner.pitchSummary}</p>
                  </div>
                )}
                {chatPartner.fundingNeeded && (
                  <div>
                    <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Funding Needed</h5>
                    <p className="mt-1 text-sm text-gray-900 font-semibold">{chatPartner.fundingNeeded}</p>
                  </div>
                )}
                {chatPartner.industry && (
                  <div>
                    <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Industry</h5>
                    <p className="mt-1 text-sm text-gray-600">{chatPartner.industry}</p>
                  </div>
                )}
              </>
            ) : (
              <>
                {chatPartner.investmentStage && chatPartner.investmentStage.length > 0 && (
                  <div>
                    <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Investment Stage</h5>
                    <p className="mt-1 text-sm text-gray-900">
                      {Array.isArray(chatPartner.investmentStage) ? chatPartner.investmentStage.join(', ') : chatPartner.investmentStage}
                    </p>
                  </div>
                )}
                {chatPartner.investmentInterests && chatPartner.investmentInterests.length > 0 && (
                  <div>
                    <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Interests</h5>
                    <p className="mt-1 text-sm text-gray-600">
                      {Array.isArray(chatPartner.investmentInterests) ? chatPartner.investmentInterests.join(', ') : chatPartner.investmentInterests}
                    </p>
                  </div>
                )}
                {(chatPartner.minimumInvestment || chatPartner.maximumInvestment) && (
                  <div>
                    <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Investment Range</h5>
                    <p className="mt-1 text-sm text-gray-900 font-semibold">
                      {chatPartner.minimumInvestment || '$0'} - {chatPartner.maximumInvestment || 'Unlimited'}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};