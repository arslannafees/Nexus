const crypto = require('crypto');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { seedUsers } = require('./data/seedUsers');
const {
  collaborationRequests: seedCollaborationRequests,
  messages: seedMessages,
  notifications: seedNotifications,
  documents: seedDocuments,
  deals: seedDeals,
} = require('./data/seedPlatformData');

const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, options: '-c search_path=nexus,public' }
  : {
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'postgres',
      database: process.env.PGDATABASE || 'business_nexus',
      options: '-c search_path=nexus,public',
    };

const pool = new Pool(poolConfig);

const mapCollaborationRequestRow = (row) => ({
  id: row.id,
  investorId: row.investor_id,
  entrepreneurId: row.entrepreneur_id,
  message: row.message,
  status: row.status,
  createdAt: row.created_at,
});

const mapMessageRow = (row) => ({
  id: row.id,
  senderId: row.sender_id,
  receiverId: row.receiver_id,
  content: row.content,
  timestamp: row.created_at,
  isRead: row.is_read,
});

const mapMeetingRow = (row) => ({
  id: row.id,
  organizerId: row.organizer_id,
  participantId: row.participant_id,
  title: row.title,
  agenda: row.agenda,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  organizer: row.organizer_name
    ? {
        id: row.organizer_id,
        name: row.organizer_name,
        avatarUrl: row.organizer_avatar_url,
        role: row.organizer_role,
      }
    : undefined,
  participant: row.participant_name
    ? {
        id: row.participant_id,
        name: row.participant_name,
        avatarUrl: row.participant_avatar_url,
        role: row.participant_role,
      }
    : undefined,
});

const formatRelativeTime = (value) => {
  const differenceMs = Date.now() - new Date(value).getTime();
  const minutes = Math.round(differenceMs / 60000);

  if (minutes < 1) {
    return 'just now';
  }

  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  const days = Math.round(hours / 24);

  if (days < 7) {
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
};

const ensureSchema = async () => {
  await pool.query('CREATE SCHEMA IF NOT EXISTS nexus');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('entrepreneur', 'investor')),
      avatar_url TEXT NOT NULL,
      bio TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      is_online BOOLEAN NOT NULL DEFAULT FALSE,
      startup_name TEXT,
      pitch_summary TEXT,
      funding_needed TEXT,
      industry TEXT,
      founded_year INTEGER,
      team_size INTEGER,
      investment_interests TEXT[] NOT NULL DEFAULT '{}',
      investment_stage TEXT[] NOT NULL DEFAULT '{}',
      portfolio_companies TEXT[] NOT NULL DEFAULT '{}',
      total_investments INTEGER NOT NULL DEFAULT 0,
      minimum_investment TEXT,
      maximum_investment TEXT,
      startup_history JSONB NOT NULL DEFAULT '[]'::jsonb,
      investment_history JSONB NOT NULL DEFAULT '[]'::jsonb,
      preferences JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS collaboration_requests (
      id TEXT PRIMARY KEY,
      investor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entrepreneur_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('message', 'connection', 'investment')),
      actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      size TEXT NOT NULL,
      last_modified DATE NOT NULL,
      shared BOOLEAN NOT NULL DEFAULT FALSE,
      url TEXT NOT NULL
    )
  `);

  // Migrate documents table with new columns
  await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1`);
  await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`);
  await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS mime_type TEXT NOT NULL DEFAULT 'application/octet-stream'`);
  await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_path TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS document_signatures (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      signer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      signature_url TEXT NOT NULL,
      signature_type TEXT NOT NULL CHECK (signature_type IN ('drawn', 'typed')),
      signer_name TEXT NOT NULL,
      signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS deals (
      id TEXT PRIMARY KEY,
      startup_name TEXT NOT NULL,
      startup_logo TEXT NOT NULL,
      industry TEXT NOT NULL,
      amount TEXT NOT NULL,
      equity TEXT NOT NULL,
      status TEXT NOT NULL,
      stage TEXT NOT NULL,
      last_activity DATE NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS meetings (
      id TEXT PRIMARY KEY,
      organizer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      agenda TEXT NOT NULL DEFAULT '',
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('deposit', 'withdraw', 'transfer')),
      amount NUMERIC NOT NULL,
      currency TEXT NOT NULL DEFAULT 'usd',
      status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
      recipient_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM users');

  if (rows[0].count === 0) {
    for (const seedUser of seedUsers) {
      const passwordHash = await bcrypt.hash(seedUser.password, 12);

      await pool.query(
        `
          INSERT INTO users (
            id, name, email, password_hash, role, avatar_url, bio, location, is_online,
            startup_name, pitch_summary, funding_needed, industry, founded_year, team_size,
            investment_interests, investment_stage, portfolio_companies, total_investments,
            minimum_investment, maximum_investment, startup_history, investment_history, preferences,
            created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9,
            $10, $11, $12, $13, $14, $15,
            $16, $17, $18, $19,
            $20, $21, $22, $23, $24,
            $25, NOW()
          )
        `,
        [
          seedUser.id,
          seedUser.name,
          seedUser.email,
          passwordHash,
          seedUser.role,
          seedUser.avatarUrl,
          seedUser.bio,
          seedUser.location || '',
          seedUser.isOnline ?? false,
          seedUser.startupName || null,
          seedUser.pitchSummary || null,
          seedUser.fundingNeeded || null,
          seedUser.industry || null,
          seedUser.foundedYear || null,
          seedUser.teamSize || null,
          seedUser.investmentInterests || [],
          seedUser.investmentStage || [],
          seedUser.portfolioCompanies || [],
          seedUser.totalInvestments || 0,
          seedUser.minimumInvestment || null,
          seedUser.maximumInvestment || null,
          JSON.stringify(seedUser.startupHistory || []),
          JSON.stringify(seedUser.investmentHistory || []),
          JSON.stringify(seedUser.preferences || []),
          seedUser.createdAt,
        ]
      );
    }
  }

  const seedTableIfEmpty = async (tableName, insertQuery, valuesFactory, seedRows) => {
    const { rows: countRows } = await pool.query(`SELECT COUNT(*)::int AS count FROM ${tableName}`);

    if (countRows[0].count > 0) {
      return;
    }

    for (const seedRow of seedRows) {
      await pool.query(insertQuery, valuesFactory(seedRow));
    }
  };

  await seedTableIfEmpty(
    'collaboration_requests',
    `
      INSERT INTO collaboration_requests (
        id, investor_id, entrepreneur_id, message, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $6)
    `,
    (request) => [
      request.id,
      request.investorId,
      request.entrepreneurId,
      request.message,
      request.status,
      request.createdAt,
    ],
    seedCollaborationRequests
  );

  await seedTableIfEmpty(
    'messages',
    `
      INSERT INTO messages (
        id, sender_id, receiver_id, content, is_read, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `,
    (message) => [
      message.id,
      message.senderId,
      message.receiverId,
      message.content,
      message.isRead,
      message.timestamp,
    ],
    seedMessages
  );

  await seedTableIfEmpty(
    'notifications',
    `
      INSERT INTO notifications (
        id, type, actor_id, recipient_id, content, is_read, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    (notification) => [
      notification.id,
      notification.type,
      notification.actorId,
      notification.recipientId,
      notification.content,
      notification.isRead,
      notification.createdAt,
    ],
    seedNotifications
  );

  await seedTableIfEmpty(
    'documents',
    `
      INSERT INTO documents (
        id, owner_id, name, type, size, last_modified, shared, url,
        version, status, mime_type, storage_path, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `,
    (document) => [
      document.id,
      document.ownerId,
      document.name,
      document.type,
      document.size,
      document.lastModified,
      document.shared,
      document.url,
      document.version || 1,
      document.status || 'active',
      document.mimeType || 'application/octet-stream',
      document.storagePath || '',
      document.createdAt || document.lastModified,
    ],
    seedDocuments
  );

  await seedTableIfEmpty(
    'deals',
    `
      INSERT INTO deals (
        id, startup_name, startup_logo, industry, amount, equity, status, stage, last_activity
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    (deal) => [
      deal.id,
      deal.startup.name,
      deal.startup.logo,
      deal.startup.industry,
      deal.amount,
      deal.equity,
      deal.status,
      deal.stage,
      deal.lastActivity,
    ],
    seedDeals
  );
};

const getUserByEmail = async (email) => {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1 LIMIT 1', [email]);
  return rows[0] || null;
};

const getUserById = async (userId) => {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [userId]);
  return rows[0] || null;
};

const getUsersByRole = async (role) => {
  const { rows } = await pool.query('SELECT * FROM users WHERE role = $1 ORDER BY created_at DESC', [role]);
  return rows.map(mapUserRow);
};

const mapUserRow = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  avatarUrl: row.avatar_url,
  bio: row.bio,
  location: row.location,
  isOnline: row.is_online,
  twoFactorEnabled: row.two_factor_enabled,
  twoFactorSecret: row.two_factor_secret,
  createdAt: row.created_at,
  ...(row.role === 'entrepreneur'
    ? {
        startupName: row.startup_name,
        pitchSummary: row.pitch_summary,
        fundingNeeded: row.funding_needed,
        industry: row.industry,
        foundedYear: row.founded_year,
        teamSize: row.team_size,
        startupHistory: row.startup_history,
      }
    : {
        investmentInterests: row.investment_interests,
        investmentStage: row.investment_stage,
        portfolioCompanies: row.portfolio_companies,
        totalInvestments: row.total_investments,
        minimumInvestment: row.minimum_investment,
        maximumInvestment: row.maximum_investment,
        investmentHistory: row.investment_history,
        preferences: row.preferences,
      }),
});

const updateUserProfile = async (userId, updates) => {
  const currentUser = await getUserById(userId);

  if (!currentUser) {
    return null;
  }

  const nextValues = {
    name: updates.name ?? currentUser.name,
    avatarUrl: updates.avatarUrl ?? currentUser.avatar_url,
    bio: updates.bio ?? currentUser.bio,
    location: updates.location ?? currentUser.location,
    startupName: updates.startupName ?? currentUser.startup_name,
    pitchSummary: updates.pitchSummary ?? currentUser.pitch_summary,
    fundingNeeded: updates.fundingNeeded ?? currentUser.funding_needed,
    industry: updates.industry ?? currentUser.industry,
    foundedYear: updates.foundedYear ?? currentUser.founded_year,
    teamSize: updates.teamSize ?? currentUser.team_size,
    investmentInterests: updates.investmentInterests ?? currentUser.investment_interests,
    investmentStage: updates.investmentStage ?? currentUser.investment_stage,
    portfolioCompanies: updates.portfolioCompanies ?? currentUser.portfolio_companies,
    totalInvestments: updates.totalInvestments ?? currentUser.total_investments,
    minimumInvestment: updates.minimumInvestment ?? currentUser.minimum_investment,
    maximumInvestment: updates.maximumInvestment ?? currentUser.maximum_investment,
    startupHistory: updates.startupHistory ?? currentUser.startup_history,
    investmentHistory: updates.investmentHistory ?? currentUser.investment_history,
    preferences: updates.preferences ?? currentUser.preferences,
  };

  const { rows } = await pool.query(
    `
      UPDATE users
      SET
        name = $2,
        avatar_url = $3,
        bio = $4,
        location = $5,
        startup_name = $6,
        pitch_summary = $7,
        funding_needed = $8,
        industry = $9,
        founded_year = $10,
        team_size = $11,
        investment_interests = $12,
        investment_stage = $13,
        portfolio_companies = $14,
        total_investments = $15,
        minimum_investment = $16,
        maximum_investment = $17,
        startup_history = $18,
        investment_history = $19,
        preferences = $20,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [
      userId,
      nextValues.name,
      nextValues.avatarUrl,
      nextValues.bio,
      nextValues.location,
      nextValues.startupName,
      nextValues.pitchSummary,
      nextValues.fundingNeeded,
      nextValues.industry,
      nextValues.foundedYear,
      nextValues.teamSize,
      nextValues.investmentInterests,
      nextValues.investmentStage,
      nextValues.portfolioCompanies,
      nextValues.totalInvestments,
      nextValues.minimumInvestment,
      nextValues.maximumInvestment,
      JSON.stringify(nextValues.startupHistory || []),
      JSON.stringify(nextValues.investmentHistory || []),
      JSON.stringify(nextValues.preferences || []),
    ]
  );

  return mapUserRow(rows[0]);
};

const getCollaborationRequests = async () => {
  const { rows } = await pool.query('SELECT * FROM collaboration_requests ORDER BY created_at DESC');
  return rows.map(mapCollaborationRequestRow);
};

const createCollaborationRequest = async ({ investorId, entrepreneurId, message }) => {
  const id = `req_${Date.now().toString(36)}`;
  const { rows } = await pool.query(
    `
      INSERT INTO collaboration_requests (
        id, investor_id, entrepreneur_id, message, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 'pending', NOW(), NOW())
      RETURNING *
    `,
    [id, investorId, entrepreneurId, message]
  );

  return mapCollaborationRequestRow(rows[0]);
};

const updateCollaborationRequest = async (requestId, status) => {
  const { rows } = await pool.query(
    `
      UPDATE collaboration_requests
      SET status = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [requestId, status]
  );

  return rows[0] ? mapCollaborationRequestRow(rows[0]) : null;
};

const getConversationsForUser = async (userId) => {
  const { rows } = await pool.query(
    `
      SELECT m.*, 
             u.name AS partner_name, 
             u.avatar_url AS partner_avatar_url, 
             u.role AS partner_role,
             u.bio AS partner_bio,
             u.location AS partner_location,
             u.is_online AS partner_is_online
      FROM messages m
      JOIN users u ON (u.id = m.sender_id AND m.receiver_id = $1)
                   OR (u.id = m.receiver_id AND m.sender_id = $1)
      WHERE m.sender_id = $1 OR m.receiver_id = $1
      ORDER BY m.created_at ASC
    `,
    [userId]
  );

  const conversationsByPartner = new Map();

  for (const row of rows) {
    const participantId = row.sender_id === userId ? row.receiver_id : row.sender_id;
    const existing = conversationsByPartner.get(participantId) || {
      messages: [],
      partner: {
        id: participantId,
        name: row.partner_name,
        avatarUrl: row.partner_avatar_url,
        role: row.partner_role,
        bio: row.partner_bio,
        location: row.partner_location,
        isOnline: row.partner_is_online,
      }
    };
    existing.messages.push(mapMessageRow(row));
    conversationsByPartner.set(participantId, existing);
  }

  return Array.from(conversationsByPartner.entries())
    .map(([participantId, data]) => {
      const lastMessage = data.messages[data.messages.length - 1];

      return {
        id: `conv-${userId}-${participantId}`,
        participants: [userId, participantId],
        lastMessage,
        updatedAt: lastMessage?.timestamp || new Date().toISOString(),
        otherUser: data.partner,
      };
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
};

const getMessagesBetweenUsers = async (user1Id, user2Id) => {
  const { rows } = await pool.query(
    `
      SELECT *
      FROM messages
      WHERE (sender_id = $1 AND receiver_id = $2)
         OR (sender_id = $2 AND receiver_id = $1)
      ORDER BY created_at ASC
    `,
    [user1Id, user2Id]
  );
  return rows.map(mapMessageRow);
};

const createMessage = async ({ senderId, receiverId, content }) => {
  const id = `msg_${crypto.randomUUID().slice(0, 8)}`;
  const { rows } = await pool.query(
    `
      INSERT INTO messages (id, sender_id, receiver_id, content, is_read, created_at)
      VALUES ($1, $2, $3, $4, FALSE, NOW())
      RETURNING *
    `,
    [id, senderId, receiverId, content]
  );
  return mapMessageRow(rows[0]);
};

const getNotifications = async () => {
  const { rows } = await pool.query(
    `
      SELECT notifications.*, users.name AS actor_name, users.avatar_url AS actor_avatar
      FROM notifications
      JOIN users ON users.id = notifications.actor_id
      ORDER BY notifications.created_at DESC
    `
  );

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    user: {
      name: row.actor_name,
      avatar: row.actor_avatar,
    },
    content: row.content,
    time: formatRelativeTime(row.created_at),
    unread: !row.is_read,
  }));
};

const mapDocumentRow = (row) => ({
  id: row.id,
  name: row.name,
  type: row.type,
  mimeType: row.mime_type,
  size: row.size,
  version: row.version,
  status: row.status,
  lastModified: row.last_modified,
  createdAt: row.created_at,
  shared: row.shared,
  url: row.url,
  storagePath: row.storage_path,
  ownerId: row.owner_id,
  ownerName: row.owner_name || undefined,
});

const mapSignatureRow = (row) => ({
  id: row.id,
  documentId: row.document_id,
  signerId: row.signer_id,
  signerName: row.signer_name,
  signatureUrl: row.signature_url,
  signatureType: row.signature_type,
  signedAt: row.signed_at,
});

const getDocuments = async () => {
  const { rows } = await pool.query(`
    SELECT documents.*, users.name AS owner_name
    FROM documents
    JOIN users ON users.id = documents.owner_id
    ORDER BY documents.last_modified DESC, documents.id DESC
  `);
  return rows.map(mapDocumentRow);
};

const getDocumentsForUser = async (userId) => {
  const { rows } = await pool.query(`
    SELECT documents.*, users.name AS owner_name
    FROM documents
    JOIN users ON users.id = documents.owner_id
    WHERE documents.owner_id = $1
    ORDER BY documents.last_modified DESC, documents.id DESC
  `, [userId]);
  return rows.map(mapDocumentRow);
};

const getDocumentById = async (docId) => {
  const { rows } = await pool.query(`
    SELECT documents.*, users.name AS owner_name
    FROM documents
    JOIN users ON users.id = documents.owner_id
    WHERE documents.id = $1
    LIMIT 1
  `, [docId]);
  return rows[0] ? mapDocumentRow(rows[0]) : null;
};

const createDocument = async ({ ownerId, name, type, mimeType, size, url, storagePath }) => {
  const id = `doc_${crypto.randomUUID().slice(0, 8)}`;
  await pool.query(`
    INSERT INTO documents (
      id, owner_id, name, type, size, last_modified, shared, url,
      version, status, mime_type, storage_path, created_at
    ) VALUES ($1, $2, $3, $4, $5, NOW(), FALSE, $6, 1, 'active', $7, $8, NOW())
  `, [id, ownerId, name, type, size, url, mimeType, storagePath]);
  return getDocumentById(id);
};

const updateDocument = async (docId, updates) => {
  const current = await getDocumentById(docId);
  if (!current) return null;

  const nextValues = {
    name: updates.name ?? current.name,
    shared: updates.shared !== undefined ? updates.shared : current.shared,
    status: updates.status ?? current.status,
    version: updates.version ?? current.version,
  };

  await pool.query(`
    UPDATE documents
    SET name = $2, shared = $3, status = $4, version = $5, last_modified = NOW()
    WHERE id = $1
  `, [docId, nextValues.name, nextValues.shared, nextValues.status, nextValues.version]);
  return getDocumentById(docId);
};

const deleteDocument = async (docId) => {
  const doc = await getDocumentById(docId);
  if (!doc) return null;
  await pool.query('DELETE FROM documents WHERE id = $1', [docId]);
  return doc;
};

const createSignature = async ({ documentId, signerId, signerName, signatureUrl, signatureType }) => {
  const id = `sig_${crypto.randomUUID().slice(0, 8)}`;
  await pool.query(`
    INSERT INTO document_signatures (
      id, document_id, signer_id, signature_url, signature_type, signer_name, signed_at
    ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
  `, [id, documentId, signerId, signatureUrl, signatureType, signerName]);

  const { rows } = await pool.query('SELECT * FROM document_signatures WHERE id = $1 LIMIT 1', [id]);
  return rows[0] ? mapSignatureRow(rows[0]) : null;
};

const getSignaturesForDocument = async (documentId) => {
  const { rows } = await pool.query(`
    SELECT * FROM document_signatures
    WHERE document_id = $1
    ORDER BY signed_at DESC
  `, [documentId]);
  return rows.map(mapSignatureRow);
};

const getDeals = async () => {
  const { rows } = await pool.query('SELECT * FROM deals ORDER BY last_activity DESC, id DESC');

  return rows.map((row) => ({
    id: row.id,
    startup: {
      name: row.startup_name,
      logo: row.startup_logo,
      industry: row.industry,
    },
    amount: row.amount,
    equity: row.equity,
    status: row.status,
    stage: row.stage,
    lastActivity: row.last_activity,
  }));
};

const getMeetingsForUser = async (userId) => {
  const { rows } = await pool.query(
    `
      SELECT
        meetings.*,
        organizer.name AS organizer_name,
        organizer.avatar_url AS organizer_avatar_url,
        organizer.role AS organizer_role,
        participant.name AS participant_name,
        participant.avatar_url AS participant_avatar_url,
        participant.role AS participant_role
      FROM meetings
      JOIN users AS organizer ON organizer.id = meetings.organizer_id
      JOIN users AS participant ON participant.id = meetings.participant_id
      WHERE meetings.organizer_id = $1 OR meetings.participant_id = $1
      ORDER BY meetings.starts_at ASC, meetings.created_at DESC
    `,
    [userId]
  );

  return rows.map(mapMeetingRow);
};

const getMeetingById = async (meetingId) => {
  const { rows } = await pool.query(
    `
      SELECT
        meetings.*,
        organizer.name AS organizer_name,
        organizer.avatar_url AS organizer_avatar_url,
        organizer.role AS organizer_role,
        participant.name AS participant_name,
        participant.avatar_url AS participant_avatar_url,
        participant.role AS participant_role
      FROM meetings
      JOIN users AS organizer ON organizer.id = meetings.organizer_id
      JOIN users AS participant ON participant.id = meetings.participant_id
      WHERE meetings.id = $1
      LIMIT 1
    `,
    [meetingId]
  );

  return rows[0] ? mapMeetingRow(rows[0]) : null;
};

const getMeetingConflicts = async ({ participantIds, startsAt, endsAt, excludeMeetingId }) => {
  const params = [participantIds, startsAt, endsAt];
  let query = `
    SELECT id
    FROM meetings
    WHERE status IN ('pending', 'accepted')
      AND (organizer_id = ANY($1) OR participant_id = ANY($1))
      AND starts_at < $3
      AND ends_at > $2
  `;

  if (excludeMeetingId) {
    query += ' AND id <> $4';
    params.push(excludeMeetingId);
  }

  const { rows } = await pool.query(query, params);
  return rows;
};

const createMeeting = async ({ organizerId, participantId, title, agenda, startsAt, endsAt }) => {
  const id = `mtg_${crypto.randomUUID().slice(0, 8)}`;

  await pool.query(
    `
      INSERT INTO meetings (
        id, organizer_id, participant_id, title, agenda, starts_at, ends_at, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW(), NOW())
    `,
    [id, organizerId, participantId, title, agenda || '', startsAt, endsAt]
  );

  return getMeetingById(id);
};

const updateMeetingStatus = async (meetingId, status) => {
  await pool.query(
    `
      UPDATE meetings
      SET status = $2, updated_at = NOW()
      WHERE id = $1
    `,
    [meetingId, status]
  );

  return getMeetingById(meetingId);
};

const deleteMeeting = async (meetingId) => {
  const meeting = await getMeetingById(meetingId);
  if (!meeting) return null;
  await pool.query('DELETE FROM meetings WHERE id = $1', [meetingId]);
  return meeting;
};

const updateUser2FA = async (userId, secret, enabled) => {
  await pool.query(
    'UPDATE users SET two_factor_secret = $2, two_factor_enabled = $3 WHERE id = $1',
    [userId, secret, enabled]
  );
  return getUserById(userId);
};

const mapTransactionRow = (row) => ({
  id: row.id,
  userId: row.user_id,
  type: row.type,
  amount: row.amount,
  currency: row.currency,
  status: row.status,
  recipientId: row.recipient_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const createTransaction = async ({ userId, type, amount, currency = 'usd', status = 'pending', recipientId = null }) => {
  const id = `txn_${crypto.randomUUID().slice(0, 8)}`;
  const { rows } = await pool.query(
    `INSERT INTO transactions (id, user_id, type, amount, currency, status, recipient_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
     RETURNING *`,
    [id, userId, type, amount, currency, status, recipientId]
  );
  return mapTransactionRow(rows[0]);
};

const getTransactionsForUser = async (userId) => {
  const { rows } = await pool.query(
    'SELECT * FROM transactions WHERE user_id = $1 OR recipient_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return rows.map(mapTransactionRow);
};

module.exports = {
  pool,
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
  mapMeetingRow,
  updateUserProfile,
  updateUser2FA,
  createTransaction,
  getTransactionsForUser,
};