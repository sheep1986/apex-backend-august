import { Router, Request, Response } from 'express';
import supabase from '../services/supabase-client';
import { authenticateUser, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Apply authentication middleware  

// Get all chats for a user
router.get('/chats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    
    // Fetch chats from database
    const { data: chats, error } = await supabase
      .from('chats')
      .select(`
        *,
        participants:chat_participants(*),
        last_message:messages(*)
      `)
      .or(`created_by.eq.${userId},participants.user_id.eq.${userId}`)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: chats || []
    });
  } catch (error) {
    console.error('Error fetching chats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch chats'
    });
  }
});

// Get all channels
router.get('/channels', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data: channels, error } = await supabase
      .from('channels')
      .select(`
        *,
        participants:channel_participants(count),
        last_message:messages(*)
      `)
      .eq('type', 'channel')
      .order('updated_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: channels || []
    });
  } catch (error) {
    console.error('Error fetching channels:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch channels'
    });
  }
});

// Get contacts
router.get('/contacts', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const orgId = req.user?.organizationId;

    // Get users from the same organization
    const { data: contacts, error } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, avatar_url, status, role')
      .eq('organization_id', orgId)
      .neq('id', userId)
      .eq('status', 'active');

    if (error) throw error;

    const transformedContacts = contacts?.map(contact => ({
      id: contact.id,
      name: `${contact.first_name} ${contact.last_name}`,
      email: contact.email,
      avatar: contact.avatar_url,
      status: contact.status,
      role: contact.role
    })) || [];

    res.json({
      success: true,
      data: transformedContacts
    });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch contacts'
    });
  }
});

// Get messages for a chat
router.get('/messages/:chatId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { chatId } = req.params;
    
    const { data: messages, error } = await supabase
      .from('messages')
      .select(`
        *,
        sender:users(id, first_name, last_name, avatar_url)
      `)
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const transformedMessages = messages?.map(msg => ({
      id: msg.id,
      chatId: msg.chat_id,
      content: msg.content,
      sender: {
        id: msg.sender.id,
        name: `${msg.sender.first_name} ${msg.sender.last_name}`,
        avatar: msg.sender.avatar_url
      },
      timestamp: new Date(msg.created_at),
      read: msg.read_at !== null,
      type: msg.type || 'text'
    })) || [];
    
    res.json({
      success: true,
      data: transformedMessages
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch messages'
    });
  }
});

// Send a message
router.post('/messages', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { chatId, content, type = 'text' } = req.body;
    const userId = req.user?.id;
    
    if (!chatId || !content || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    const { data: newMessage, error } = await supabase
      .from('messages')
      .insert({
        chat_id: chatId,
        sender_id: userId,
      content,
        type,
        created_at: new Date().toISOString()
      })
      .select(`
        *,
        sender:users(id, first_name, last_name, avatar_url)
      `)
      .single();

    if (error) throw error;

    // Update chat's last message timestamp
    await supabase
      .from('chats')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', chatId);

    const transformedMessage = {
      id: newMessage.id,
      chatId: newMessage.chat_id,
      content: newMessage.content,
      sender: {
        id: newMessage.sender.id,
        name: `${newMessage.sender.first_name} ${newMessage.sender.last_name}`,
        avatar: newMessage.sender.avatar_url
      },
      timestamp: new Date(newMessage.created_at),
      read: false,
      type: newMessage.type
    };
    
    res.status(201).json({
      success: true,
      data: transformedMessage
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send message'
    });
  }
});

// Create new chat
  router.post('/chats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { type = 'direct', name, participantIds } = req.body;
    const userId = req.user?.id;

    if (!participantIds || participantIds.length === 0) {
      return res.status(400).json({
      success: false,
        error: 'At least one participant is required'
    });
  }

    // Create the chat
    const { data: newChat, error: chatError } = await supabase
      .from('chats')
      .insert({
      type,
        name: name || 'New Chat',
        created_by: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (chatError) throw chatError;

    // Add participants (including creator)
    const allParticipants = [...new Set([userId, ...participantIds])];
    const participantInserts = allParticipants.map(participantId => ({
      chat_id: newChat.id,
      user_id: participantId,
      joined_at: new Date().toISOString()
    }));

    const { error: participantError } = await supabase
      .from('chat_participants')
      .insert(participantInserts);

    if (participantError) throw participantError;
    
    res.status(201).json({
      success: true,
      data: newChat
    });
  } catch (error) {
    console.error('Error creating chat:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create chat'
    });
  }
});

// Search messages and chats
  router.get('/search', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { q: query } = req.query;
    const userId = req.user?.id;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }

    // Search messages
    const { data: messages, error: messageError } = await supabase
      .from('messages')
      .select(`
        *,
        chat:chats(*),
        sender:users(id, first_name, last_name)
      `)
      .ilike('content', `%${query}%`)
      .limit(50);
    
    // Search chats by name
    const { data: chats, error: chatError } = await supabase
      .from('chats')
      .select('*')
      .ilike('name', `%${query}%`)
      .limit(20);

    if (messageError || chatError) {
      throw messageError || chatError;
    }
    
    res.json({
      success: true,
      data: {
        messages: messages || [],
        chats: chats || []
      }
    });
  } catch (error) {
    console.error('Error searching:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search'
    });
  }
});

export default router; 