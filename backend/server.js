const path = require('path');
const http = require('http');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { Server } = require('socket.io');
const { body, validationResult } = require('express-validator');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_mock');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const {
  ensureSchema,
  getUserByEmail,
  getUserById,
  getUsersByRole,
  getCollaborationRequests,
  createCollaborationRequest,
  updateCollaborationRequest,
  getConversationsForUser,
  getMessagesBetweenUsers,
  createMessage,
  getNotifications,
  getDocuments,
  getDocumentsForUser,
  getDocumentById,
  createDocument,
  updateDocument,
  deleteDocument,
  createSignature,
  getSignaturesForDocument,
  getDeals,
  getMeetingsForUser,
  getMeetingById,
  getMeetingConflicts,
  createMeeting,
  updateMeetingStatus,
  deleteMeeting,
  mapUserRow,
  pool,
  updateUserProfile,
  updateUser2FA,
  createTransaction,
  getTransactionsForUser,
} = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true,
  },
});
const port = Number(process.env.PORT || 4000);
const jwtSecret = process.env.JWT_SECRET || 'development-secret-change-me';

app.use(cors());
app.use(express.json({ limit: '25mb' }));

// Ensure upload directories exist
const uploadsDir = path.join(__dirname, 'uploads');
const documentsUploadDir = path.join(uploadsDir, 'documents');
const signaturesUploadDir = path.join(uploadsDir, 'signatures');
fs.mkdirSync(documentsUploadDir, { recursive: true });
fs.mkdirSync(signaturesUploadDir, { recursive: true });

// Serve uploaded files statically
app.use('/uploads', express.static(uploadsDir));

const swaggerOptions = {
  swaggerDefinition: {
    openapi: '3.0.0',
    info: { title: 'Nexus API', version: '1.0.0' },
  },
  apis: ['./server.js'],
};
const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Multer configuration for document uploads
const allowedMimeTypes = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/plain',
  'text/csv',
]);

const documentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, documentsUploadDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const safeOriginalName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${uniqueSuffix}_${safeOriginalName}`);
  },
});

const uploadDocument = multer({
  storage: documentStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    if (allowedMimeTypes.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  },
});

const getFileTypeLabel = (mimeType) => {
  const typeMap = {
    'application/pdf': 'PDF',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Spreadsheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'Presentation',
    'application/msword': 'Document',
    'application/vnd.ms-excel': 'Spreadsheet',
    'application/vnd.ms-powerpoint': 'Presentation',
    'image/png': 'Image',
    'image/jpeg': 'Image',
    'image/gif': 'Image',
    'image/webp': 'Image',
    'text/plain': 'Text',
    'text/csv': 'CSV',
  };
  return typeMap[mimeType] || 'File';
};

const formatFileSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const signToken = (user) => {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      email: user.email,
    },
    jwtSecret,
    { expiresIn: '7d' }
  );
};

const authRequired = async (req, res, next) => {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authorization header missing' });
  }

  try {
    const token = header.slice('Bearer '.length);
    const payload = jwt.verify(token, jwtSecret);
    const user = await getUserById(payload.sub);

    if (!user) {
      return res.status(401).json({ message: 'Session expired' });
    }

    req.authenticatedUser = mapUserRow(user);
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

const sanitizeUserForUpdate = (body, role) => {
  const base = {
    name: body.name,
    avatarUrl: body.avatarUrl,
    bio: body.bio,
    location: body.location,
  };

  if (role === 'entrepreneur') {
    return {
      ...base,
      startupName: body.startupName,
      pitchSummary: body.pitchSummary,
      fundingNeeded: body.fundingNeeded,
      industry: body.industry,
      foundedYear: body.foundedYear ? Number(body.foundedYear) : undefined,
      teamSize: body.teamSize ? Number(body.teamSize) : undefined,
      startupHistory: Array.isArray(body.startupHistory) ? body.startupHistory : undefined,
    };
  }

  return {
    ...base,
    investmentInterests: Array.isArray(body.investmentInterests) ? body.investmentInterests : undefined,
    investmentStage: Array.isArray(body.investmentStage) ? body.investmentStage : undefined,
    portfolioCompanies: Array.isArray(body.portfolioCompanies) ? body.portfolioCompanies : undefined,
    totalInvestments: body.totalInvestments ? Number(body.totalInvestments) : undefined,
    minimumInvestment: body.minimumInvestment,
    maximumInvestment: body.maximumInvestment,
    investmentHistory: Array.isArray(body.investmentHistory) ? body.investmentHistory : undefined,
    preferences: Array.isArray(body.preferences) ? body.preferences : undefined,
  };
};

const allowedRequestStatuses = new Set(['pending', 'accepted', 'rejected']);
const meetingStatuses = new Set(['pending', 'accepted', 'rejected']);

const parseMeetingDate = (value) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const assertMeetingNoConflict = async ({ organizerId, participantId, startsAt, endsAt, excludeMeetingId }) => {
  const conflicts = await getMeetingConflicts({
    participantIds: [organizerId, participantId],
    startsAt,
    endsAt,
    excludeMeetingId,
  });

  if (conflicts.length > 0) {
    const error = new Error('Meeting conflicts with an existing booking');
    error.statusCode = 409;
    throw error;
  }
};

const sendRouteError = (res, error, fallbackMessage) => {
  if (error?.statusCode) {
    return res.status(error.statusCode).json({ message: error.message || fallbackMessage });
  }

  return res.status(500).json({ message: error?.message || fallbackMessage });
};

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    res.status(500).json({ status: 'error', message: 'Database unavailable' });
  }
});

const validate = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map(validation => validation.run(req)));
    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }
    res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
  };
};

app.post('/api/auth/register', validate([
  body('name').trim().notEmpty().withMessage('Name is required').escape(),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['entrepreneur', 'investor']).withMessage('Invalid role')
]), async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};

    const existingUser = await getUserByEmail(email.toLowerCase());
    if (existingUser) {
      return res.status(409).json({ message: 'Email already in use' });
    }

    const userId = `${role === 'entrepreneur' ? 'e' : 'i'}_${crypto.randomUUID().slice(0, 8)}`;
    const passwordHash = await bcrypt.hash(password, 12);
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;

    const { rows } = await pool.query(
      `
        INSERT INTO users (
          id, name, email, password_hash, role, avatar_url, bio, location, is_online,
          startup_history, investment_history, preferences
        ) VALUES (
          $1, $2, $3, $4, $5, $6, '', '', TRUE, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
        )
        RETURNING *
      `,
      [userId, name, email.toLowerCase(), passwordHash, role, avatarUrl]
    );

    const user = mapUserRow(rows[0]);
    res.status(201).json({ token: signToken(user), user });
  } catch (error) {
    return sendRouteError(res, error, 'Unable to create account');
  }
});

app.post('/api/auth/login', validate([
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  body('role').isIn(['entrepreneur', 'investor']).withMessage('Invalid role')
]), async (req, res) => {
  try {
    const { email, password, role, otp } = req.body || {};

    const userRow = await getUserByEmail(email.toLowerCase());

    if (!userRow) {
      return res.status(401).json({ message: 'Invalid credentials or user not found' });
    }

    if (userRow.role !== role) {
      return res.status(403).json({ message: 'Role does not match this account' });
    }

    const isPasswordValid = await bcrypt.compare(password, userRow.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials or user not found' });
    }

    if (userRow.two_factor_enabled) {
      if (!otp) {
        return res.status(401).json({ message: '2FA required', requires2FA: true });
      }
      const verified = speakeasy.totp.verify({
        secret: userRow.two_factor_secret,
        encoding: 'base32',
        token: otp,
        window: 1
      });
      if (!verified) {
        return res.status(401).json({ message: 'Invalid 2FA token' });
      }
    }

    const user = mapUserRow(userRow);
    res.json({ token: signToken(user), user });
  } catch (error) {
    return sendRouteError(res, error, 'Unable to sign in');
  }
});

app.get('/api/auth/me', authRequired, async (req, res) => {
  res.json({ user: req.authenticatedUser });
});

app.post('/api/auth/2fa/setup', authRequired, async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({ name: `Nexus (${req.authenticatedUser.email})` });
    await updateUser2FA(req.authenticatedUser.id, secret.base32, false);
    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);
    res.json({ secret: secret.base32, qrCodeUrl });
  } catch (error) {
    return sendRouteError(res, error, 'Unable to setup 2FA');
  }
});

app.post('/api/auth/2fa/verify', authRequired, async (req, res) => {
  try {
    const { otp } = req.body || {};
    const userRow = await getUserById(req.authenticatedUser.id);
    if (!userRow || !userRow.two_factor_secret) {
      return res.status(400).json({ message: '2FA not setup' });
    }
    const verified = speakeasy.totp.verify({
      secret: userRow.two_factor_secret,
      encoding: 'base32',
      token: otp,
      window: 1
    });
    if (verified) {
      await updateUser2FA(req.authenticatedUser.id, userRow.two_factor_secret, true);
      res.json({ message: '2FA enabled successfully' });
    } else {
      res.status(400).json({ message: 'Invalid OTP' });
    }
  } catch (error) {
    return sendRouteError(res, error, 'Unable to verify 2FA');
  }
});

app.post('/api/payments/deposit', authRequired, validate([
  body('amount').isNumeric().withMessage('Amount must be a number')
]), async (req, res) => {
  try {
    const { amount } = req.body;
    let clientSecret = null;

    try {
      // Mock Stripe PaymentIntent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: 'usd',
        payment_method_types: ['card'],
      });
      clientSecret = paymentIntent.client_secret;
    } catch (stripeError) {
      console.warn('Stripe payment intent creation failed, continuing with mock transaction.', stripeError?.message || stripeError);
    }

    // Record transaction regardless of Stripe response
    const transaction = await createTransaction({
      userId: req.authenticatedUser.id,
      type: 'deposit',
      amount,
      status: 'completed'
    });

    res.json({ clientSecret, transaction });
  } catch (error) {
    return sendRouteError(res, error, 'Deposit failed');
  }
});

app.post('/api/payments/withdraw', authRequired, validate([
  body('amount').isNumeric().withMessage('Amount must be a number')
]), async (req, res) => {
  try {
    const { amount } = req.body;
    const transaction = await createTransaction({
      userId: req.authenticatedUser.id,
      type: 'withdraw',
      amount,
      status: 'completed'
    });
    res.json({ transaction });
  } catch (error) {
    return sendRouteError(res, error, 'Withdrawal failed');
  }
});

app.post('/api/payments/transfer', authRequired, validate([
  body('amount').isNumeric().withMessage('Amount must be a number'),
  body('recipientId').notEmpty().withMessage('Recipient is required')
]), async (req, res) => {
  try {
    const { amount, recipientId } = req.body;
    const recipient = await getUserById(recipientId);
    if (!recipient) {
      return res.status(404).json({ message: 'Recipient not found' });
    }
    const transaction = await createTransaction({
      userId: req.authenticatedUser.id,
      type: 'transfer',
      amount,
      status: 'completed',
      recipientId
    });
    res.json({ transaction });
  } catch (error) {
    return sendRouteError(res, error, 'Transfer failed');
  }
});

app.get('/api/payments/transactions', authRequired, async (req, res) => {
  try {
    const transactions = await getTransactionsForUser(req.authenticatedUser.id);
    res.json({ transactions });
  } catch (error) {
    return sendRouteError(res, error, 'Failed to fetch transactions');
  }
});

app.get('/api/users', authRequired, async (req, res) => {
  const { role } = req.query;

  if (role && !['entrepreneur', 'investor'].includes(role)) {
    return res.status(400).json({ message: 'Invalid role filter' });
  }

  if (role) {
    const users = await getUsersByRole(role);
    return res.json({ users });
  }

  const { rows } = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
  res.json({ users: rows.map(mapUserRow) });
});

app.get('/api/collaboration-requests', authRequired, async (_req, res) => {
  const requests = await getCollaborationRequests();
  res.json({ requests });
});

app.post('/api/collaboration-requests', authRequired, async (req, res) => {
  const { investorId, entrepreneurId, message } = req.body || {};

  if (!investorId || !entrepreneurId || !message) {
    return res.status(400).json({ message: 'Investor ID, entrepreneur ID, and message are required' });
  }

  const investor = await getUserById(investorId);
  const entrepreneur = await getUserById(entrepreneurId);

  if (!investor || investor.role !== 'investor') {
    return res.status(400).json({ message: 'Invalid investor ID' });
  }

  if (!entrepreneur || entrepreneur.role !== 'entrepreneur') {
    return res.status(400).json({ message: 'Invalid entrepreneur ID' });
  }

  const existingRequest = await pool.query(
    'SELECT id FROM collaboration_requests WHERE investor_id = $1 AND entrepreneur_id = $2 LIMIT 1',
    [investorId, entrepreneurId]
  );

  if (existingRequest.rows[0]) {
    return res.status(409).json({ message: 'A collaboration request already exists for this pair' });
  }

  const request = await createCollaborationRequest({ investorId, entrepreneurId, message });
  res.status(201).json({ request });
});

app.patch('/api/collaboration-requests/:id', authRequired, async (req, res) => {
  const { status } = req.body || {};

  if (!allowedRequestStatuses.has(status)) {
    return res.status(400).json({ message: 'Invalid collaboration request status' });
  }

  const { rows } = await pool.query('SELECT * FROM collaboration_requests WHERE id = $1 LIMIT 1', [req.params.id]);
  const existingRequest = rows[0];

  if (!existingRequest) {
    return res.status(404).json({ message: 'Collaboration request not found' });
  }

  if (req.authenticatedUser.id !== existingRequest.investor_id && req.authenticatedUser.id !== existingRequest.entrepreneur_id) {
    return res.status(403).json({ message: 'You can only update your own collaboration requests' });
  }

  const request = await updateCollaborationRequest(req.params.id, status);

  res.json({ request });
});

app.get('/api/messages/conversations', authRequired, async (req, res) => {
  const conversations = await getConversationsForUser(req.authenticatedUser.id);
  res.json({ conversations });
});

app.get('/api/messages/:userId', authRequired, async (req, res) => {
  try {
    const { userId } = req.params;
    const messages = await getMessagesBetweenUsers(req.authenticatedUser.id, userId);
    res.json({ messages });
  } catch (error) {
    return sendRouteError(res, error, 'Unable to fetch messages');
  }
});

app.post('/api/messages', authRequired, async (req, res) => {
  try {
    const { receiverId, content } = req.body;

    if (!receiverId || !content || !content.trim()) {
      return res.status(400).json({ message: 'Receiver ID and non-empty content are required' });
    }

    const message = await createMessage({
      senderId: req.authenticatedUser.id,
      receiverId,
      content: content.trim(),
    });

    res.status(201).json({ message });
  } catch (error) {
    return sendRouteError(res, error, 'Unable to send message');
  }
});

app.get('/api/notifications', authRequired, async (_req, res) => {
  const notifications = await getNotifications();
  res.json({ notifications });
});

// --- Document CRUD Routes ---

app.get('/api/documents', authRequired, async (req, res) => {
  try {
    const documents = await getDocumentsForUser(req.authenticatedUser.id);
    res.json({ documents });
  } catch (error) {
    return sendRouteError(res, error, 'Unable to fetch documents');
  }
});

app.get('/api/documents/:id', authRequired, async (req, res) => {
  try {
    const document = await getDocumentById(req.params.id);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }
    if (document.ownerId !== req.authenticatedUser.id && !document.shared) {
      return res.status(403).json({ message: 'Access denied' });
    }
    res.json({ document });
  } catch (error) {
    return sendRouteError(res, error, 'Unable to fetch document');
  }
});

app.post('/api/documents', authRequired, (req, res) => {
  uploadDocument.single('file')(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: 'File exceeds 20 MB limit' });
        }
        return res.status(400).json({ message: err.message });
      }
      return res.status(400).json({ message: err.message || 'Upload failed' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    try {
      const file = req.file;
      const document = await createDocument({
        ownerId: req.authenticatedUser.id,
        name: file.originalname,
        type: getFileTypeLabel(file.mimetype),
        mimeType: file.mimetype,
        size: formatFileSize(file.size),
        url: `/uploads/documents/${file.filename}`,
        storagePath: file.path,
      });

      res.status(201).json({ document });
    } catch (error) {
      // Clean up file on DB error
      if (req.file?.path) {
        fs.unlink(req.file.path, () => {});
      }
      return sendRouteError(res, error, 'Unable to save document');
    }
  });
});

app.patch('/api/documents/:id', authRequired, async (req, res) => {
  try {
    const document = await getDocumentById(req.params.id);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }
    if (document.ownerId !== req.authenticatedUser.id) {
      return res.status(403).json({ message: 'You can only update your own documents' });
    }

    const { name, shared, status } = req.body || {};
    const updatedDocument = await updateDocument(req.params.id, { name, shared, status });
    res.json({ document: updatedDocument });
  } catch (error) {
    return sendRouteError(res, error, 'Unable to update document');
  }
});

app.delete('/api/documents/:id', authRequired, async (req, res) => {
  try {
    const document = await getDocumentById(req.params.id);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }
    if (document.ownerId !== req.authenticatedUser.id) {
      return res.status(403).json({ message: 'You can only delete your own documents' });
    }

    // Delete file from disk if it exists
    if (document.storagePath && fs.existsSync(document.storagePath)) {
      fs.unlinkSync(document.storagePath);
    }

    await deleteDocument(req.params.id);
    res.json({ message: 'Document deleted' });
  } catch (error) {
    return sendRouteError(res, error, 'Unable to delete document');
  }
});

app.get('/api/documents/:id/download', authRequired, async (req, res) => {
  try {
    const document = await getDocumentById(req.params.id);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }
    if (document.ownerId !== req.authenticatedUser.id && !document.shared) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (document.storagePath && fs.existsSync(document.storagePath)) {
      res.setHeader('Content-Disposition', `attachment; filename="${document.name}"`);
      res.setHeader('Content-Type', document.mimeType || 'application/octet-stream');
      const fileStream = fs.createReadStream(document.storagePath);
      fileStream.pipe(res);
    } else {
      return res.status(404).json({ message: 'File not found on disk' });
    }
  } catch (error) {
    return sendRouteError(res, error, 'Unable to download document');
  }
});

// --- Signature Routes ---

app.get('/api/documents/:id/signatures', authRequired, async (req, res) => {
  try {
    const document = await getDocumentById(req.params.id);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }
    const signatures = await getSignaturesForDocument(req.params.id);
    res.json({ signatures });
  } catch (error) {
    return sendRouteError(res, error, 'Unable to fetch signatures');
  }
});

app.post('/api/documents/:id/signatures', authRequired, async (req, res) => {
  try {
    const document = await getDocumentById(req.params.id);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const { signatureData, signatureType } = req.body || {};
    if (!signatureData || !signatureType) {
      return res.status(400).json({ message: 'Signature data and type are required' });
    }
    if (!['drawn', 'typed'].includes(signatureType)) {
      return res.status(400).json({ message: 'Signature type must be drawn or typed' });
    }

    // Save signature image from base64
    const signatureFileName = `sig_${Date.now()}_${crypto.randomUUID().slice(0, 8)}.png`;
    const signaturePath = path.join(signaturesUploadDir, signatureFileName);
    const base64Data = signatureData.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(signaturePath, Buffer.from(base64Data, 'base64'));

    const signature = await createSignature({
      documentId: req.params.id,
      signerId: req.authenticatedUser.id,
      signerName: req.authenticatedUser.name,
      signatureUrl: `/uploads/signatures/${signatureFileName}`,
      signatureType,
    });

    // Update document status
    await updateDocument(req.params.id, { status: 'active' });

    res.status(201).json({ signature });
  } catch (error) {
    return sendRouteError(res, error, 'Unable to save signature');
  }
});

app.get('/api/deals', authRequired, async (_req, res) => {
  const deals = await getDeals();
  res.json({ deals });
});

app.get('/api/meetings', authRequired, async (req, res) => {
  const meetings = await getMeetingsForUser(req.authenticatedUser.id);
  res.json({ meetings });
});

app.get('/api/meetings/:id', authRequired, async (req, res) => {
  const meeting = await getMeetingById(req.params.id);

  if (!meeting) {
    return res.status(404).json({ message: 'Meeting not found' });
  }

  if (req.authenticatedUser.id !== meeting.organizerId && req.authenticatedUser.id !== meeting.participantId) {
    return res.status(403).json({ message: 'You can only access your own meetings' });
  }

  res.json({ meeting });
});

app.post('/api/meetings', authRequired, async (req, res) => {
  const { participantId, title, agenda, startsAt, endsAt } = req.body || {};

  if (!participantId || !title || !startsAt || !endsAt) {
    return res.status(400).json({ message: 'Participant, title, start time, and end time are required' });
  }

  if (participantId === req.authenticatedUser.id) {
    return res.status(400).json({ message: 'You cannot schedule a meeting with yourself' });
  }

  const participant = await getUserById(participantId);
  if (!participant) {
    return res.status(400).json({ message: 'Invalid participant ID' });
  }

  const parsedStartsAt = parseMeetingDate(startsAt);
  const parsedEndsAt = parseMeetingDate(endsAt);

  if (!parsedStartsAt || !parsedEndsAt || parsedEndsAt <= parsedStartsAt) {
    return res.status(400).json({ message: 'Invalid meeting time window' });
  }

  try {
    await assertMeetingNoConflict({
      organizerId: req.authenticatedUser.id,
      participantId,
      startsAt: parsedStartsAt,
      endsAt: parsedEndsAt,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'Unable to schedule meeting' });
  }

  const meeting = await createMeeting({
    organizerId: req.authenticatedUser.id,
    participantId,
    title,
    agenda,
    startsAt: parsedStartsAt,
    endsAt: parsedEndsAt,
  });

  res.status(201).json({ meeting });
});

app.patch('/api/meetings/:id/accept', authRequired, async (req, res) => {
  const meeting = await getMeetingById(req.params.id);

  if (!meeting) {
    return res.status(404).json({ message: 'Meeting not found' });
  }

  if (req.authenticatedUser.id !== meeting.participantId) {
    return res.status(403).json({ message: 'Only the invited participant can accept this meeting' });
  }

  if (meeting.status !== 'pending') {
    return res.status(400).json({ message: 'Only pending meetings can be accepted' });
  }

  try {
    await assertMeetingNoConflict({
      organizerId: meeting.organizerId,
      participantId: meeting.participantId,
      startsAt: meeting.startsAt,
      endsAt: meeting.endsAt,
      excludeMeetingId: meeting.id,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'Unable to accept meeting' });
  }

  const updatedMeeting = await updateMeetingStatus(meeting.id, 'accepted');
  res.json({ meeting: updatedMeeting });
});

app.patch('/api/meetings/:id/reject', authRequired, async (req, res) => {
  const meeting = await getMeetingById(req.params.id);

  if (!meeting) {
    return res.status(404).json({ message: 'Meeting not found' });
  }

  if (req.authenticatedUser.id !== meeting.participantId && req.authenticatedUser.id !== meeting.organizerId) {
    return res.status(403).json({ message: 'You can only update your own meetings' });
  }

  if (!meetingStatuses.has(meeting.status)) {
    return res.status(400).json({ message: 'Invalid meeting status' });
  }

  const updatedMeeting = await updateMeetingStatus(meeting.id, 'rejected');
  res.json({ meeting: updatedMeeting });
});

app.delete('/api/meetings/:id', authRequired, async (req, res) => {
  try {
    const meeting = await getMeetingById(req.params.id);

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    if (req.authenticatedUser.id !== meeting.organizerId && req.authenticatedUser.id !== meeting.participantId) {
      return res.status(403).json({ message: 'You can only delete your own meetings' });
    }

    await deleteMeeting(req.params.id);
    res.json({ message: 'Meeting deleted successfully' });
  } catch (error) {
    return sendRouteError(res, error, 'Unable to delete meeting');
  }
});

app.patch('/api/users/:id/profile', authRequired, async (req, res) => {
  if (req.authenticatedUser.id !== req.params.id) {
    return res.status(403).json({ message: 'You can only update your own profile' });
  }

  const nextProfile = sanitizeUserForUpdate(req.body || {}, req.authenticatedUser.role);
  const updatedUser = await updateUserProfile(req.params.id, nextProfile);

  if (!updatedUser) {
    return res.status(404).json({ message: 'User not found' });
  }

  res.json(updatedUser);
});

app.get('/api/users/:id', authRequired, async (req, res) => {
  const userRow = await getUserById(req.params.id);

  if (!userRow) {
    return res.status(404).json({ message: 'User not found' });
  }

  res.json(mapUserRow(userRow));
});

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {};

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const userRow = await getUserByEmail(email.toLowerCase());

    if (!userRow) {
      return res.json({ message: 'If the account exists, reset instructions were sent' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30);

    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userRow.id]);
    await pool.query(
      'INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)',
      [token, userRow.id, expiresAt]
    );

    res.json({
      message: 'If the account exists, reset instructions were sent',
      resetToken: process.env.NODE_ENV === 'production' ? undefined : token,
    });
  } catch (error) {
    return sendRouteError(res, error, 'Unable to request password reset');
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body || {};

    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Token and new password are required' });
    }

    const { rows } = await pool.query(
      `
        SELECT password_reset_tokens.*, users.email
        FROM password_reset_tokens
        JOIN users ON users.id = password_reset_tokens.user_id
        WHERE token = $1
        LIMIT 1
      `,
      [token]
    );

    const resetRow = rows[0];

    if (!resetRow || new Date(resetRow.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, resetRow.user_id]);
    await pool.query('DELETE FROM password_reset_tokens WHERE token = $1', [token]);

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    return sendRouteError(res, error, 'Unable to reset password');
  }
});

io.on('connection', (socket) => {
  socket.on('join-room', ({ roomId, userId, userName }) => {
    if (!roomId || !userId) {
      return;
    }

    socket.data.roomId = roomId;
    socket.data.userId = userId;
    socket.data.userName = userName || 'Guest';
    socket.join(roomId);

    const roomSize = io.sockets.adapter.rooms.get(roomId)?.size || 0;
    socket.emit('room-joined', { roomId, participantCount: roomSize });
    socket.to(roomId).emit('peer-joined', { roomId, userId, userName: socket.data.userName });
  });

  socket.on('offer', ({ roomId, offer }) => {
    if (roomId && offer) {
      socket.to(roomId).emit('offer', { offer, senderId: socket.data.userId });
    }
  });

  socket.on('answer', ({ roomId, answer }) => {
    if (roomId && answer) {
      socket.to(roomId).emit('answer', { answer, senderId: socket.data.userId });
    }
  });

  socket.on('ice-candidate', ({ roomId, candidate }) => {
    if (roomId && candidate) {
      socket.to(roomId).emit('ice-candidate', { candidate, senderId: socket.data.userId });
    }
  });

  socket.on('media-state', ({ roomId, audioEnabled, videoEnabled }) => {
    if (roomId) {
      socket.to(roomId).emit('media-state', {
        audioEnabled,
        videoEnabled,
        senderId: socket.data.userId,
      });
    }
  });

  socket.on('end-call', ({ roomId }) => {
    const activeRoomId = roomId || socket.data.roomId;

    if (activeRoomId) {
      socket.to(activeRoomId).emit('end-call', { roomId: activeRoomId, endedBy: socket.data.userId });
      socket.leave(activeRoomId);
    }
  });

  socket.on('disconnect', () => {
    if (socket.data.roomId) {
      socket.to(socket.data.roomId).emit('peer-left', { roomId: socket.data.roomId, userId: socket.data.userId });
    }
  });
});

const startServer = async () => {
  await ensureSchema();
  server.listen(port, () => {
    console.log(`API server running on http://localhost:${port}`);
  });
};

startServer().catch((error) => {
  console.error('Failed to start backend:', error);
  process.exit(1);
});
// Database service is now running. Triggering file watcher restart.