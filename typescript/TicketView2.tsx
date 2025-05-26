import React, { useState, useEffect, useCallback, useRef, forwardRef, TextareaHTMLAttributes } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, addDoc, onSnapshot, query, orderBy, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { Ticket, TicketStatus, TicketPriority, TicketType } from '../../types/ticket';
import { useAuth } from '../../context/AuthContext';
import { useAccount } from '../../context/AccountContext';
import { commonStyles, typography } from '../../styles';
import { MarkdownRenderer } from '../common/MarkdownRenderer';
import TicketEstimation from './TicketEstimation';
import { X, Loader, MessageSquare, Share2, Edit, ArrowLeft, Code, ChevronRight, FilePlus, Copy, Check } from 'lucide-react';
import { COLUMN_STATUS_LABELS, BacklogStatus, BoardStatus } from '../../types/board';
import LinkedTickets from './LinkedTickets';
import { ContextSearchService } from '../../services/contextSearch';
import { AIService } from '../../services/aiService';
import {
  generateInitialSpecificationPrompt,
  generateSpecificationUpdatePrompt
} from '../../services/prompts/ticketSpecificationPrompts';
import { useGeminiClient } from '../../hooks';
import TicketModal from './TicketModal';
import Notification, { NotificationType } from '../ui/notification';
import { IntentDetectionService, UserIntent } from '../../services/intentDetection';
import { AIResponseService } from '../../services/aiResponseService';
import { AIActionButtons } from '../Chat/AIActionButtons';
import { WorkflowState } from '../Chat/WorkflowIndicator';

// Define message structure for the chat just something to change
interface TicketMessage {
  id: string;
  ticketId: string;
  accountId: string;
  userId: string;
  userName: string;
  userPhotoURL?: string;
  content: string;
  timestamp: Timestamp;
  repositoryRef?: {
    repositoryId: string;
    filePath?: string;
    lineStart?: number;
    lineEnd?: number;
  };
  isRefinement?: boolean;
  refinementContext?: string;
  isAiGenerated?: boolean;
  isSystemMessage?: boolean;
  specificationUpdated?: boolean;
  suggestedActions?: {
    label: string;
    action: string;
    primary?: boolean;
  }[];
}

// Define status options
const BACKLOG_OPTIONS: BacklogStatus[] = [
  'BACKLOG_ICEBOX',
  'BACKLOG_NEW',
  'BACKLOG_REFINED',
  'BACKLOG_DEV_NEXT'
];

const DEVELOPMENT_OPTIONS: BoardStatus[] = [
  'SELECTED_FOR_DEV',
  'IN_PROGRESS',
  'READY_FOR_TESTING',
  'DEPLOYED'
];

// Add this helper function after the component definitions but before the main component
// Cleans and formats markdown content to ensure proper rendering
const cleanMarkdownContent = (content: string): string => {
  if (!content) return '';
  
  // Strip outer markdown block if present
  let processed = content.replace(/^```markdown\s*\n/, '').replace(/\n\s*```\s*$/, '');
  
  // Fix any malformed headings (ensure space after #)
  processed = processed.replace(/^(#+)([^#\s])/gm, '$1 $2');
  
  // Split the content into lines
  const lines = processed.split('\n');
  const result: string[] = [];
  
  // Process line by line
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    // Check if this is a list item followed by a code block
    if ((line.match(/^\d+\.\s+/) || line.match(/^\*\s+/)) && 
        i + 1 < lines.length && 
        lines[i + 1].trim().startsWith('```')) {
      // Add the current line
      result.push(line);
      // Add an extra blank line before the code block
      result.push('');
    } else if (line.trim() === 'tsx' && 
               i + 1 < lines.length &&
               !lines[i + 1].trim().startsWith('```')) {
      // Fix standalone 'tsx' that should be a code fence start
      result.push('```tsx');
    } else {
      result.push(line);
    }
  }
  
  // Join lines back together
  processed = result.join('\n');
  
  // Make sure all code blocks are properly formatted
  processed = processed.replace(/```(\w*)\s*/g, '```$1\n');
  processed = processed.replace(/\s*```(?!\w)/g, '\n```');
  
  return processed;
};

// Add a component to properly render the AI specification
const AISpecificationRenderer = ({ 
  content, 
  onRefineSection,
}: { 
  content: string;
  onRefineSection?: (section: string) => void;
}) => {
  const [copied, setCopied] = useState(false);
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);

  // Very simple content processing - just strip line numbers
  const processContent = (rawContent: string): string => {
    if (!rawContent) return '';
    
    // Remove line numbers from all lines
    return rawContent.split('\n')
      .map(line => line.replace(/^\s*\d+\s+/, ''))
      .join('\n');
  };

  const processedContent = processContent(content);
  
  // Split content into sections for hover effects and refinement
  const sections = processedContent.split(/\n(?=##)/);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  // Function to initiate refinement of a specific section
  const handleSectionRefinement = (section: string) => {
    // Call the provided callback if available
    if (onRefineSection) {
      onRefineSection(section);
    }
  };

  return (
    <div className="relative border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-800">
      <button
        onClick={handleCopy}
        className="absolute right-4 top-4 p-2 bg-gray-100 dark:bg-gray-700 rounded-md text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white z-10"
        title="Copy specification"
      >
        {copied ? (
          <Check className="h-5 w-5" />
        ) : (
          <Copy className="h-5 w-5" />
        )}
      </button>
      
      {/* Render sections with hover effects and refinement buttons */}
      <div className="prose dark:prose-invert max-w-none">
        {sections.map((section, index) => (
          <div 
            key={index}
            className={`relative group p-2 -m-2 rounded-md transition-colors ${
              hoveredSection === section ? 'bg-blue-50 dark:bg-blue-900/10' : ''
            }`}
            onMouseEnter={() => setHoveredSection(section)}
            onMouseLeave={() => setHoveredSection(null)}
          >
            <MarkdownRenderer content={section} variant="ticket" />
            
            {hoveredSection === section && onRefineSection && (
              <button
                onClick={() => handleSectionRefinement(section)}
                className="absolute right-2 top-2 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded px-2 py-1 opacity-90 hover:opacity-100 transition-opacity"
              >
                Refine This Section
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// Define the AutoResizeTextarea component inline
type AutoResizeTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  value: string;
};

const AutoResizeTextarea = forwardRef<HTMLTextAreaElement, AutoResizeTextareaProps>(
  ({ value, onChange, className, ...props }, ref) => {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const [content, setContent] = useState(value || '');

    // Handle forwarded ref
    const assignRef = (instance: HTMLTextAreaElement | null) => {
      // Save a reference to the textarea DOM node
      textareaRef.current = instance;
      
      // Forward the ref if provided
      if (typeof ref === 'function') {
        ref(instance);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = instance;
      }
    };

    // Resize the textarea when content changes
    const adjustHeight = () => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      
      // Reset height to allow shrinking
      textarea.style.height = 'auto';
      
      // Set height based on scrollHeight
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    };

    // Adjust height whenever content changes
    useEffect(() => {
      adjustHeight();
    }, [content]);

    // Handle input changes
    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setContent(e.target.value);
      if (onChange) {
        onChange(e);
      }
    };

    return (
      <textarea
        ref={assignRef}
        value={value}
        onChange={handleChange}
        className={className}
        rows={1}
        {...props}
      />
    );
  }
);

AutoResizeTextarea.displayName = 'AutoResizeTextarea';

export default function TicketView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentAccount } = useAccount();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [messageContent, setMessageContent] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [users, setUsers] = useState<{[key: string]: any}>({});
  const [generatingAI, setGeneratingAI] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const geminiClient = useGeminiClient();
  const contextSearch = React.useMemo(() => new ContextSearchService(), []);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<'requirements' | 'specification' | 'linked'>(
    () => {
      // If we're initializing and there's an AI specification, default to that tab
      if (ticket?.aiSpecification) {
        return 'specification';
      }
      return 'requirements';
    }
  );
  const [showErrorNotification, setShowErrorNotification] = useState<string | null>(null);
  const [selectedMessageContent, setSelectedMessageContent] = useState<string | null>(null);
  const [refinementContext, setRefinementContext] = useState<string | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isRefinementExpanded, setIsRefinementExpanded] = useState(false);
  const intentDetectionService = React.useMemo(() => new IntentDetectionService(), []);
  const aiResponseService = React.useMemo(() => new AIResponseService(), []);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [workflowState, setWorkflowState] = useState<WorkflowState>(WorkflowState.GATHERING_REQUIREMENTS);
  const [notificationMessage, setNotificationMessage] = useState<{ 
    type: NotificationType; 
    message: string; 
    action?: { 
      label: string; 
      onClick: () => void 
    }; 
  } | null>(null);

  // Helper for navigating back
  const navigateBack = () => {
    const status = ticket?.status || '';
    
    if (status.startsWith('BACKLOG_')) {
      navigate('/tickets/backlog');
    } else {
      navigate('/tickets/board');
    }
  };

  // Scroll to bottom of messages
  const scrollToBottom = useCallback(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messagesContainerRef]);

  // Auto-scroll chat when messages change or when page loads
  useEffect(() => {
    if (messages.length > 0) {
      // Use setTimeout to ensure the DOM has updated with new messages
      setTimeout(scrollToBottom, 100);
    }
  }, [messages, scrollToBottom]);

  // Add an additional effect to scroll to bottom after initial load
  useEffect(() => {
    if (!messagesLoading && messages.length > 0) {
      setTimeout(scrollToBottom, 300);
    }
  }, [messagesLoading, messages.length, scrollToBottom]);

  // Move the handleEditClick function before the useEffect that uses it
  const handleEditClick = useCallback(() => {
    // Directly set the selected ticket to open the modal
    if (ticket) {
      setSelectedTicket(ticket);
    }
  }, [ticket, setSelectedTicket]);

  // Define handleSaveEdit with useCallback
  const handleSaveEdit = useCallback(async () => {
    if (!ticket || !id || !user || !currentAccount) return;

    try {
      const ticketRef = doc(db, 'tickets', id);
      await updateDoc(ticketRef, {
        title: ticket.title,
        description: ticket.description,
        status: ticket.status,
        priority: ticket.priority,
        assigneeId: ticket.assigneeId,
        type: ticket.type,
        updatedAt: Date.now(),
      });
      
      setIsEditing(false);
    } catch (error) {
      console.error('[TicketView] Error updating ticket:', error);
    }
  }, [ticket, id, user, currentAccount]);

  // Setup keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only process shortcuts when no input fields are focused
      if (document.activeElement?.tagName === 'INPUT' || 
          document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      // e - edit
      if (e.key === 'e' && !isEditing) {
        e.preventDefault();
        handleEditClick();
      }
      
      // ESC - cancel edit
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isEditing) {
          handleCancelEdit();
        }
      }
      
      // s - save (when editing)
      if (e.key === 's' && e.ctrlKey && isEditing) {
        e.preventDefault();
        handleSaveEdit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, handleSaveEdit, handleEditClick]);

  // Load ticket data
  useEffect(() => {
    const fetchTicket = async () => {
      if (!id || !currentAccount?.id) {
        setLoading(false);
        return;
      }

      try {
        const ticketRef = doc(db, 'tickets', id);
        const ticketDoc = await getDoc(ticketRef);
        
        if (ticketDoc.exists()) {
          const ticketData = { id: ticketDoc.id, ...ticketDoc.data() } as Ticket;
          
          // Verify the ticket belongs to the current account
          if (ticketData.accountId === currentAccount.id) {
            setTicket(ticketData);
          } else {
            console.error('[TicketView] Ticket belongs to a different account');
            navigate('/tickets');
          }
        } else {
          console.error('[TicketView] Ticket not found:', id);
          navigate('/tickets');
        }
      } catch (error) {
        console.error('[TicketView] Error loading ticket:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchTicket();
  }, [id, currentAccount, navigate]);

  // Show error notification helper
  const showError = (message: string) => {
    setShowErrorNotification(message);
    setTimeout(() => setShowErrorNotification(null), 4000);
  };

  // 1. Fix the message loading to use the correct subcollection path
  useEffect(() => {
    if (!id || !currentAccount?.id) return;
    
    setMessagesLoading(true);
    
    // Updated: Use messages subcollection directly under the ticket
    const messagesRef = collection(db, 'tickets', id, 'messages');
    const messagesQuery = query(
      messagesRef,
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const messagesData = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      } as TicketMessage));
      
      setMessages(messagesData);
      setMessagesLoading(false);
    }, (error) => {
      console.error('[TicketView] Error loading messages:', error);
      showError('Error loading messages. Please try refreshing the page.');
      setMessagesLoading(false);
    });

    return () => unsubscribe();
  }, [id, currentAccount?.id]);

  // Load users for the account
  useEffect(() => {
    if (!currentAccount) return;
    
    const fetchUsers = async () => {
      const userPromises = Object.keys(currentAccount.members).map(async (userId) => {
        try {
          const userDoc = await getDoc(doc(db, 'users', userId));
          if (userDoc.exists()) {
            return { userId, userData: userDoc.data() };
          }
        } catch (error) {
          console.error(`Failed to load user ${userId}:`, error);
        }
        return null;
      });

      const usersData = await Promise.all(userPromises);
      const newUsers: Record<string, any> = {};
      
      usersData.forEach(user => {
        if (user) {
          newUsers[user.userId] = user.userData;
        }
      });

      setUsers(newUsers);
    };

    fetchUsers();
  }, [currentAccount]);

  const getUserName = (userId: string) => {
    const userInfo = users[userId];
    return userInfo?.displayName || userInfo?.email || 'Unknown User';
  };

  const handleLinkedTicketsUpdate = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const handleViewLinkedTicket = (linkedTicketId: string) => {
    navigate(`/tickets/view/${linkedTicketId}`);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  // Handler for refining a specific section
  const handleRefineSection = useCallback((section: string) => {
    // Set refinement context
    setRefinementContext(section);
    
    // Clear previous message content
    setMessageContent('');
    
    // Focus the message input
    setTimeout(() => {
      if (messageInputRef.current) {
        messageInputRef.current.focus();
      }
    }, 100);
  }, []);

  // Function to update the specification from a message
  const handleUpdateSpecification = async () => {
    if (!ticket || !id || !selectedMessageContent) return;
    
    try {
      const cleanedContent = cleanMarkdownContent(selectedMessageContent);
      
      // 1. Try to update the ticket with the new specification
      try {
        const ticketRef = doc(db, 'tickets', id);
        await updateDoc(ticketRef, {
          aiSpecification: cleanedContent,
          updatedAt: Date.now()
        });
        
        // 2. Try to add an update record to the messages collection
        try {
          await addDoc(collection(db, 'tickets', id, 'messages'), {
            ticketId: id,
            accountId: currentAccount?.id,
            userId: 'system',
            userName: 'System',
            content: `Specification updated with new content`,
            timestamp: Timestamp.now(),
            isSystemMessage: true,
            specificationUpdated: true
          });
        } catch (messageError) {
          console.warn('[TicketView] Could not add system message about spec update:', messageError);
          // Continue despite error - it's not critical
        }
      } catch (updateError) {
        console.warn('[TicketView] Error updating ticket document:', updateError);
        showError('Database update failed. Changes applied locally only.');
      }
      
      // 3. Update local ticket state (regardless of Firestore success)
      setTicket(current => 
        current ? { ...current, aiSpecification: cleanedContent } : null
      );
      
      // 4. Reset selected message
      setSelectedMessageContent(null);
      
      // 5. Show success notification with option to view specification
      setNotificationMessage({
        type: 'success',
        message: 'AI specification generated successfully',
        action: {
          label: 'View Specification',
          onClick: () => setActiveTab('specification')
        }
      });
      setTimeout(() => {
        setNotificationMessage(null);
      }, 5000);
    } catch (error) {
      console.error('[TicketView] Error updating specification:', error);
      showError('Failed to update specification. Please try again.');
      
      // Fallback: Try to update local state at least
      if (ticket && selectedMessageContent) {
        setTicket({
          ...ticket,
          aiSpecification: cleanMarkdownContent(selectedMessageContent)
        });
        setSelectedMessageContent(null);
      }
    }
  };

  // Add a function to handle offline sync
  const syncOfflineMessages = useCallback(async () => {
    // Check if we're back online and have offline messages
    if (navigator.onLine && localStorage.getItem(`ticket_${id}_offline_messages`)) {
      try {
        const offlineMessages = JSON.parse(localStorage.getItem(`ticket_${id}_offline_messages`) || '[]');
        
        if (offlineMessages.length > 0) {
          // Batch add all offline messages
          const messagesRef = collection(db, 'tickets', id || 'unknown', 'messages');
          
          for (const message of offlineMessages) {
            await addDoc(messagesRef, {
              ...message,
              syncedFromOffline: true,
              timestamp: Timestamp.fromMillis(message.timestamp || Date.now())
            });
          }
          
          // Clear offline storage after successful sync
          localStorage.removeItem(`ticket_${id}_offline_messages`);
        }
      } catch (error) {
        console.error('[TicketView] Error syncing offline messages:', error);
      }
    }
  }, [id]);

  // Add online/offline detection
  useEffect(() => {
    const handleOnline = () => {
      syncOfflineMessages();
    };
    
    window.addEventListener('online', handleOnline);
    
    // Check if we're online now and have messages to sync
    if (navigator.onLine) {
      syncOfflineMessages();
    }
    
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [syncOfflineMessages]);

  // Modify handleMessageSubmit to support offline mode and handle permission errors
  const handleMessageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!messageContent.trim() || !id || !user || !currentAccount?.id) return;
    
    setSendingMessage(true);
    
    try {
      // If this is a refinement, create enhanced content that includes the context
      const enhancedContent = refinementContext 
        ? `REFINEMENT CONTEXT:\n\`\`\`\n${refinementContext}\n\`\`\`\n\nFEEDBACK:\n${messageContent}`
        : messageContent;

      // Analyze user intent with Gemini if available, fall back to rule-based
      const intentAnalysis = geminiClient 
        ? await intentDetectionService.analyzeMessageWithGemini(messageContent, geminiClient)
        : intentDetectionService.analyzeMessage(messageContent);
      
      // Create the user message
      const newMessage = {
        ticketId: id,
        accountId: currentAccount.id,
        userId: user.uid,
        userName: user.displayName || user.email || 'Unknown User',
        userPhotoURL: user.photoURL || undefined,
        content: enhancedContent,
        timestamp: Timestamp.now(),
        // Add metadata if this is a refinement message
        ...(refinementContext && {
          isRefinement: true,
          refinementContext
        })
      };
      
      if (navigator.onLine) {
        // Online: Try to add message to Firestore
        try {
          await addDoc(collection(db, 'tickets', id, 'messages'), newMessage);
          
          // Generate AI response based on intent if confidence is high enough
          if (intentAnalysis.confidence > 0.5) {
            // Get the appropriate response
            const aiResponse = aiResponseService.generateResponse(messageContent, intentAnalysis);
            
            // Create and add the AI response message with suggested actions
            const aiResponseMessage = {
              ticketId: id,
              accountId: currentAccount.id,
              userId: 'ai-system',
              userName: 'QEEK AI',
              content: aiResponse.message,
              timestamp: Timestamp.now(),
              isAiGenerated: true,
              suggestedActions: aiResponse.suggestedActions
            };
            
            try {
              await addDoc(collection(db, 'tickets', id, 'messages'), aiResponseMessage);
              
              // If intent is strong for regeneration, automatically trigger it
              if (intentAnalysis.primaryIntent === UserIntent.REGENERATE_SPEC && 
                  intentAnalysis.confidence > 0.8) {
                // Add slight delay to let the user see the AI response first
                setTimeout(() => handleGenerateAISpec(), 1500);
              }
            } catch (error) {
              console.error('[TicketView] Error adding AI response message:', error);
            }
          }
        } catch (error) {
          console.warn('[TicketView] Error writing to Firestore messages collection:', error);
          
          // Store in localStorage as fallback
          const offlineMessages = JSON.parse(localStorage.getItem(`ticket_${id}_offline_messages`) || '[]');
          offlineMessages.push({
            ...newMessage,
            timestamp: Date.now() // Store as milliseconds for localStorage
          });
          localStorage.setItem(`ticket_${id}_offline_messages`, JSON.stringify(offlineMessages));
          
          // Add to local state to show immediately
          setMessages(prevMessages => [
            ...prevMessages, 
            { ...newMessage, id: `offline_${Date.now()}` } as TicketMessage
          ]);
          
          // Show notification about offline mode
          showError('Unable to save message to database. Message saved locally and will sync when permissions are fixed.');
        }
      } else {
        // Offline: Store in localStorage for later sync
        const offlineMessages = JSON.parse(localStorage.getItem(`ticket_${id}_offline_messages`) || '[]');
        offlineMessages.push({
          ...newMessage,
          timestamp: Date.now() // Store as milliseconds for localStorage
        });
        localStorage.setItem(`ticket_${id}_offline_messages`, JSON.stringify(offlineMessages));
        
        // Add to local state to show immediately
        setMessages(prevMessages => [
          ...prevMessages, 
          { ...newMessage, id: `offline_${Date.now()}` } as TicketMessage
        ]);
      }
      
      setMessageContent('');
      setRefinementContext(null);
    } catch (error) {
      console.error('[TicketView] Error sending message:', error);
      showError('Failed to send message. Please try again.');
      
      // Add error handling for network issues
      if (error instanceof Error && error.message.includes('network')) {
        showError('Network error. Message saved locally and will be synced when online.');
      }
    } finally {
      setSendingMessage(false);
    }
  };

  // 3. Update handleGenerateAISpec to use the same subcollection
  const handleGenerateAISpec = async () => {
    if (!ticket || !id || !currentAccount?.id || !user) return;
    
    setGeneratingAI(true);
    
    try {
      // 1. Search for relevant context based on ticket description
      const results = await contextSearch.searchByMessage(ticket.description || '');
      
      // Group results by type
      const context = {
        files: results.filter(r => r.type === 'file'),
        tickets: results.filter(r => r.type === 'ticket'),
        functions: results.filter(r => r.type === 'function')
      };
      
      // 2. Initialize AI service with repo from account settings
      let repoId = 'default-repo-id';
      if (currentAccount?.repositories && currentAccount.repositories.length > 0) {
        repoId = currentAccount.repositories[0].id; // Already in owner_repo format
      }
      
      const aiService = new AIService(repoId, currentAccount.id);
      await aiService.initialize();
      
      // 3. Create a synthetic conversation for the AI, including any previous chat messages
      const isRegeneration = Boolean(ticket.aiSpecification);
      
      // Build the prompt based on whether this is the first generation or a regeneration
      let promptContent = '';
      
      if (isRegeneration) {
        // Include previous chat messages as context for the regeneration
        const relevantMessages = messages
          .filter(msg => !msg.isSystemMessage && !msg.isAiGenerated)
          .map(msg => `**${msg.userName}**: ${msg.content}`)
          .join('\n\n');
        
        promptContent = generateSpecificationUpdatePrompt(
          ticket.title,
          ticket.description || '',
          relevantMessages
        );
      } else {
        // Get context files for first-time generation
        const contextFiles = context.files.slice(0, 3).map(file => ({
          name: file.path || file.title || 'Unknown file', 
          description: file.description || (file.content ? file.content.substring(0, 100) : 'No description')
        }));
        
        promptContent = generateInitialSpecificationPrompt(
          ticket.title, 
          ticket.description || '',
          contextFiles
        );
      }
      
      const aiPromptMessages = [
        {
          role: 'user' as const,
          content: promptContent
        }
      ];
      
      // 4. Generate the response using the AI service
      const aiContent = await aiService.generateResponse(
        aiPromptMessages,
        context,
        geminiClient
      );
      
      // 5. Create a temporary message object for display
      const tempMessage = {
        id: `temp-${Date.now()}`,
        ticketId: id,
        accountId: currentAccount.id,
        userId: 'ai-system',
        userName: 'QEEK AI',
        content: aiContent,
        timestamp: Timestamp.now(),
        isAiGenerated: true
      };
      
      // 6. Try to add to Firestore, but handle permission errors gracefully
      try {
        await addDoc(collection(db, 'tickets', id, 'messages'), tempMessage);
      } catch (dbError) {
        console.warn('[TicketView] Error writing to Firestore messages collection:', dbError);
        // Fall back to adding message to local state only
        setMessages(prevMessages => [...prevMessages, tempMessage as TicketMessage]);
      }
      
      // 7. Process content and create cleaned version
      const cleanedContent = cleanMarkdownContent(aiContent);
      
      // 8. Try to update the ticket with the AI specification
      try {
        const ticketRef = doc(db, 'tickets', id);
        await updateDoc(ticketRef, {
          aiSpecification: cleanedContent,
          updatedAt: Date.now()
        });
      } catch (updateError) {
        console.warn('[TicketView] Error updating ticket document:', updateError);
        // Show error notification but still update local state
        showError('Unable to save specification to database. Using local version temporarily.');
      }
      
      // 9. Update local ticket state regardless of Firestore success
      setTicket(current => 
        current ? { ...current, aiSpecification: cleanedContent } : null
      );
      
      // 10. Show success notification with option to view specification
      setNotificationMessage({
        type: 'success',
        message: 'AI specification generated successfully',
        action: {
          label: 'View Specification',
          onClick: () => setActiveTab('specification')
        }
      });
      setTimeout(() => {
        setNotificationMessage(null);
      }, 5000);
      
      // 11. Clean up
      aiService.cleanup();
    } catch (error) {
      console.error('[TicketView] Error generating AI specification:', error);
      showError('Failed to generate AI specification. Please try again.');
    } finally {
      setGeneratingAI(false);
    }
  };

  const handleShare = () => {
    if (!id) return;
    
    const url = `${window.location.origin}/tickets/view/${id}`;
    navigator.clipboard.writeText(url)
      .then(() => {
        alert('Ticket URL copied to clipboard');
      })
      .catch((error) => {
        console.error('Failed to copy URL:', error);
      });
  };

  // Toggle refinement context expansion
  const toggleRefinementExpansion = () => {
    setIsRefinementExpanded(!isRefinementExpanded);
  };

  // Update workflow state based on ticket and messages
  useEffect(() => {
    if (!ticket) {
      setWorkflowState(WorkflowState.GATHERING_REQUIREMENTS);
      return;
    }
    
    // Check if we have a message indicating the spec is approved
    const hasApprovalMessage = messages.some(m => 
      m.userId === user?.uid && // User messages, not AI
      messages.indexOf(m) > 0 && // Not the first message
      intentDetectionService.analyzeMessage(m.content).primaryIntent === UserIntent.APPROVE_SPEC
    );
    
    if (hasApprovalMessage) {
      setWorkflowState(WorkflowState.FINALIZED);
      return;
    }
    
    if (ticket.aiSpecification) {
      // Count refinement messages to determine if we're in finalizing stage
      const refinementCount = messages.filter(m => m.isRefinement).length;
      
      if (refinementCount >= 2) {
        setWorkflowState(WorkflowState.FINALIZING_DETAILS);
      } else {
        setWorkflowState(WorkflowState.REFINING_SPECIFICATION);
      }
    } else {
      setWorkflowState(WorkflowState.GATHERING_REQUIREMENTS);
    }
  }, [ticket, messages, user?.uid, intentDetectionService]);

  // Handle AI action button clicks
  const handleActionClick = async (action: string) => {
    if (isProcessingAction) return;
    
    setIsProcessingAction(true);
    
    try {
      switch (action) {
        case 'regenerate_spec':
          await handleGenerateAISpec();
          break;
          
        case 'finalize_spec':
          // Set the workflow state to finalized
          setWorkflowState(WorkflowState.FINALIZED);
          
          // Add a system message to indicate the spec has been finalized
          if (id && currentAccount?.id) {
            try {
              await addDoc(collection(db, 'tickets', id, 'messages'), {
                ticketId: id,
                accountId: currentAccount.id,
                userId: 'system',
                userName: 'System',
                content: `Specification has been finalized and approved for implementation.`,
                timestamp: Timestamp.now(),
                isSystemMessage: true
              });
            } catch (error) {
              console.error('[TicketView] Error adding finalization system message:', error);
            }
          }
          break;
          
        case 'view_spec':
          // Switch to the specification tab
          setActiveTab('specification');
          break;
          
        case 'continue_conversation':
          // Focus the input field for the user to add more details
          if (messageInputRef.current) {
            messageInputRef.current.focus();
          }
          break;
          
        case 'refine_section':
          // Just focus the input - refinementContext should already be set
          if (messageInputRef.current) {
            messageInputRef.current.focus();
          }
          break;
          
        case 'answer_question':
        case 'clarify_approach':
          // These would typically generate an AI response, but for now just focus input
          if (messageInputRef.current) {
            messageInputRef.current.focus();
          }
          break;
          
        default:
          console.warn(`[TicketView] Unknown action: ${action}`);
      }
    } catch (error) {
      console.error('[TicketView] Error processing action:', error);
      showError('Failed to process action. Please try again.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Helper to determine if this message content is actually a specification
  const isSpecificationContent = (content: string): boolean => {
    // Check if the content has any of these specification section markers
    const specificationMarkers = [
      '## Implementation Steps',
      '## Technical Considerations',
      '## Files to Change',
      '## Implementation Details',
      '### Implementation Steps',
      '### Technical Considerations', 
      '### Files to Change',
      '### Implementation Details'
    ];
    
    // Check if it contains at least 2 of the specification markers
    const markerCount = specificationMarkers.filter(marker => 
      content.includes(marker)
    ).length;
    
    // If it contains specification markers and is reasonably long, it's a spec
    return markerCount >= 1 && content.length > 200;
  };

  // Now add logic to show an initial AI welcome message when a user first visits a ticket
  useEffect(() => {
    const addWelcomeMessage = async () => {
      // Only add welcome message if:
      // 1. Messages have loaded
      // 2. There are no messages yet
      // 3. We have a current account and ticket ID
      if (!messagesLoading && messages.length === 0 && currentAccount?.id && id && !ticket?.aiSpecification) {
        try {
          await addDoc(collection(db, 'tickets', id, 'messages'), {
            ticketId: id,
            accountId: currentAccount.id,
            userId: 'ai-system',
            userName: 'QEEK AI',
            content: "Welcome to this ticket! I can help you develop a clear specification for this task. Would you like me to generate an initial specification based on the ticket description?",
            timestamp: Timestamp.now(),
            isAiGenerated: true,
            suggestedActions: [
              { label: 'Generate Specification', action: 'regenerate_spec', primary: true },
              { label: 'Add More Details First', action: 'continue_conversation' }
            ]
          });
        } catch (error) {
          console.error('[TicketView] Error adding welcome message:', error);
        }
      }
    };
    
    addWelcomeMessage();
  }, [messagesLoading, messages.length, currentAccount?.id, id, ticket?.aiSpecification]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <h1 className={typography.h2}>Ticket Not Found</h1>
        <p className={typography.body}>The ticket you're looking for doesn't exist or you don't have permission to view it.</p>
        <button
          onClick={() => navigate('/tickets')}
          className={`${commonStyles.button.base} ${commonStyles.button.primary} mt-4`}
        >
          Go to Tickets
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-900 overflow-hidden">
      {/* Success notification */}
      {notificationMessage && (
        <div className="absolute top-4 right-4 z-50">
          <Notification 
            type={notificationMessage.type} 
            message={notificationMessage.message}
            action={notificationMessage.action}
          />
        </div>
      )}
      
      {/* Error notification */}
      {showErrorNotification && (
        <div className="absolute top-4 right-4 z-50">
          <Notification 
            type="error" 
            message={showErrorNotification} 
          />
        </div>
      )}
      
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        {/* Breadcrumb navigation with action buttons aligned right */}
        <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 mb-4">
          <div className="flex items-center">
            <button 
              onClick={() => navigate('/tickets/all')}
              className="hover:text-blue-600 dark:hover:text-blue-400"
            >
              Tickets
            </button>
            <ChevronRight className="w-3 h-3 mx-2" />
            <button 
              onClick={navigateBack}
              className="hover:text-blue-600 dark:hover:text-blue-400"
            >
              {ticket.status.startsWith('BACKLOG_') ? 'Backlog' : 'Board'}
            </button>
            <ChevronRight className="w-3 h-3 mx-2" />
            <span className="text-gray-700 dark:text-gray-300 font-medium">
              {ticket.ticket_id}
            </span>
          </div>
          
          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleEditClick}
              className={`${commonStyles.button.base} ${commonStyles.button.secondary} flex items-center gap-2`}
              title="Edit Ticket (press 'e')"
            >
              <Edit className="w-4 h-4" />
              Edit
            </button>
            
            <button
              onClick={handleShare}
              className={`${commonStyles.button.base} ${commonStyles.button.secondary} flex items-center gap-2`}
              title="Share Ticket Link"
            >
              <Share2 className="w-4 h-4" />
              Share
            </button>
          </div>
        </div>
        
        {/* Main header content with status indicators aligned right */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <button
              onClick={navigateBack}
              className="p-2 mt-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
            
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {ticket.ticket_id}
                </span>
              </div>
              <h1 className={`${typography.h2} text-gray-900 dark:text-white`}>
                {ticket.title}
              </h1>
            </div>
          </div>
          
          {/* Status indicators on the same line as title, aligned right */}
          <div className="flex flex-wrap gap-3 items-start mt-1">
            <div>
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Status
              </div>
              <div className="px-3 py-1.5 rounded-md inline-block bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                {COLUMN_STATUS_LABELS[ticket.status] || ticket.status}
              </div>
            </div>
            
            <div>
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Priority
              </div>
              <div className={`px-3 py-1.5 rounded-md inline-block
                ${ticket.priority === 'high' 
                  ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' 
                  : ticket.priority === 'medium'
                  ? 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400'
                  : 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                }
              `}>
                {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
              </div>
            </div>
            
            <div>
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Type
              </div>
              <div className={`px-3 py-1.5 rounded-md inline-block
                ${ticket.type === 'bug' 
                  ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' 
                  : ticket.type === 'story'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                  : 'bg-gray-50 text-gray-700 dark:bg-gray-900/20 dark:text-gray-400'
                }
              `}>
                {ticket.type.charAt(0).toUpperCase() + ticket.type.slice(1)}
              </div>
            </div>
            
            <div>
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Assigned To
              </div>
              <div className="px-3 py-1.5 text-gray-700 dark:text-gray-300">
                {ticket.assigneeId ? getUserName(ticket.assigneeId) : 'Unassigned'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content Area - Split view layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Requirements/Specification */}
        <div className="w-1/2 flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex-shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 pt-4">
            <nav className="flex gap-4">
              <button
                onClick={() => setActiveTab('requirements')}
                className={`py-2 px-1 font-medium text-sm border-b-2 ${
                  activeTab === 'requirements'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                Original Requirements
              </button>
              <button
                onClick={() => setActiveTab('specification')}
                className={`py-2 px-1 font-medium text-sm border-b-2 ${
                  activeTab === 'specification'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                AI Specification
              </button>
              <button
                onClick={() => setActiveTab('linked')}
                className={`py-2 px-1 font-medium text-sm border-b-2 ${
                  activeTab === 'linked'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                Linked Tickets
              </button>
            </nav>
          </div>
          
          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-6">
              {isEditing ? (
                <div className="space-y-6">
                  <div>
                    <label className={`block mb-2 ${typography.small}`}>
                      Title
                    </label>
                    <input
                      type="text"
                      value={ticket.title}
                      onChange={(e) => setTicket({...ticket, title: e.target.value})}
                      className={`${commonStyles.input} w-full`}
                      required
                    />
                  </div>
                  
                  <div>
                    <label className={`block mb-2 ${typography.small}`}>
                      Description
                    </label>
                    <textarea
                      value={ticket.description}
                      onChange={(e) => setTicket({...ticket, description: e.target.value})}
                      className={`${commonStyles.input} w-full min-h-[200px]`}
                      required
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className={`block mb-2 ${typography.small}`}>
                        Status
                      </label>
                      <select
                        value={ticket.status}
                        onChange={(e) => setTicket({...ticket, status: e.target.value as TicketStatus})}
                        className={commonStyles.input}
                      >
                        <optgroup label="Backlog">
                          {BACKLOG_OPTIONS.map((value) => (
                            <option key={value} value={value}>
                              {COLUMN_STATUS_LABELS[value]}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Development">
                          {DEVELOPMENT_OPTIONS.map((value) => (
                            <option key={value} value={value}>
                              {COLUMN_STATUS_LABELS[value]}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                    
                    <div>
                      <label className={`block mb-2 ${typography.small}`}>
                        Priority
                      </label>
                      <select
                        value={ticket.priority}
                        onChange={(e) => setTicket({...ticket, priority: e.target.value as TicketPriority})}
                        className={commonStyles.input}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className={`block mb-2 ${typography.small}`}>
                        Type
                      </label>
                      <select
                        value={ticket.type}
                        onChange={(e) => setTicket({...ticket, type: e.target.value as TicketType})}
                        className={commonStyles.input}
                      >
                        <option value="bug">Bug</option>
                        <option value="task">Task</option>
                        <option value="story">Story</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className={`block mb-2 ${typography.small}`}>
                        Assigned To
                      </label>
                      <select
                        value={ticket.assigneeId || ''}
                        onChange={(e) => setTicket({...ticket, assigneeId: e.target.value || undefined})}
                        className={commonStyles.input}
                      >
                        <option value="">Unassigned</option>
                        {Object.entries(users).map(([userId, userInfo]) => (
                          <option key={userId} value={userId}>
                            {userInfo.displayName || userInfo.email || 'Unknown User'}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  <div className="flex justify-end gap-2 pt-4">
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className={`${commonStyles.button.base} ${commonStyles.button.secondary}`}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      className={`${commonStyles.button.base} ${commonStyles.button.primary}`}
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Tab content */}
                  {activeTab === 'requirements' ? (
                    <div>
                      <h2 className={`${typography.h3} mb-4`}>Original Requirements</h2>
                      <div className="prose dark:prose-invert max-w-none">
                        <MarkdownRenderer content={ticket.description} variant="ticket" />
                      </div>
                    </div>
                  ) : activeTab === 'specification' ? (
                    <div>
                      <div className="flex justify-between items-center mb-4">
                        <h2 className={typography.h3}>AI-Refined Specification</h2>
                        {!ticket.aiSpecification && (
                          <button
                            onClick={handleGenerateAISpec}
                            disabled={generatingAI}
                            className={`${commonStyles.button.base} ${commonStyles.button.primary} flex items-center gap-2 ${generatingAI ? 'opacity-50' : ''}`}
                          >
                            {generatingAI ? (
                              <>
                                <Loader className="w-4 h-4 animate-spin" />
                                Generating...
                              </>
                            ) : (
                              <>
                                <Code className="w-4 h-4" />
                                Generate Specification
                              </>
                            )}
                          </button>
                        )}
                      </div>
                      {ticket.aiSpecification ? (
                        <>
                          {/* Display estimation information if available */}
                          <TicketEstimation ticket={ticket} />
                          
                          <AISpecificationRenderer 
                            content={ticket.aiSpecification} 
                            onRefineSection={handleRefineSection}
                          />
                        </>
                      ) : (
                        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-md text-gray-500 dark:text-gray-400 text-center">
                          <p>No AI specification has been generated yet.</p>
                          <p className="mt-2 text-sm">Click the "Generate Specification" button to create one.</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <h2 className={`${typography.h3} mb-4`}>Linked Tickets</h2>
                      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                        <LinkedTickets 
                          ticket={ticket} 
                          onUpdate={handleLinkedTicketsUpdate} 
                          onViewTicket={handleViewLinkedTicket}
                          key={`linked-tickets-${refreshTrigger}`}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Right Panel - Chat */}
        <div className="w-1/2 flex flex-col border-l border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Chat Header */}
          <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <div className="flex items-center justify-between p-3">
              <div className="flex items-center">
                <h2 className={typography.h3}>Ticket AI Chat Refinement</h2>
                <div className="flex items-center gap-2 ml-2">
                  <div className="w-24 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${
                        workflowState === WorkflowState.FINALIZED 
                          ? 'bg-green-500' 
                          : 'bg-blue-500'
                      } transition-all duration-500`}
                      style={{ 
                        width: workflowState === WorkflowState.GATHERING_REQUIREMENTS 
                          ? '25%' 
                          : workflowState === WorkflowState.REFINING_SPECIFICATION 
                            ? '50%' 
                            : workflowState === WorkflowState.FINALIZING_DETAILS 
                              ? '75%' 
                              : '100%' 
                      }}
                    ></div>
                  </div>
                  <span className={`text-xs font-medium ${
                    workflowState === WorkflowState.FINALIZED 
                      ? 'text-green-500 dark:text-green-400' 
                      : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    {workflowState === WorkflowState.GATHERING_REQUIREMENTS 
                      ? 'Gathering Requirements' 
                      : workflowState === WorkflowState.REFINING_SPECIFICATION 
                        ? 'Refining Specification' 
                        : workflowState === WorkflowState.FINALIZING_DETAILS 
                          ? 'Finalizing Details' 
                          : 'Specification Approved ✓'}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleGenerateAISpec}
                  disabled={generatingAI}
                  className={`${commonStyles.button.base} ${commonStyles.button.secondary} flex items-center gap-2 ${generatingAI ? 'opacity-50' : ''}`}
                >
                  {generatingAI ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Code className="w-4 h-4" />
                      Generate Spec
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
          
          {/* Messages - Scrollable Area */}
          <div className="flex-1 overflow-y-auto p-4" ref={messagesContainerRef}>
            {messagesLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader className="w-8 h-8 animate-spin text-blue-500" />
                <span className="ml-3 text-gray-500 dark:text-gray-400">Loading messages...</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <MessageSquare className="w-12 h-12 mb-2 stroke-1" />
                <p>No messages yet. Start the discussion!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message, index) => {
                  // Group related messages (for refinements)
                  const isStartOfRefinementGroup = message.isRefinement && 
                    (index === 0 || !messages[index - 1].isRefinement || 
                     messages[index - 1].refinementContext !== message.refinementContext);
                   
                  // Check if this is an AI response to a refinement
                  const isAiResponseToRefinement = message.userId === 'ai-system' && 
                    index > 0 && messages[index - 1].isRefinement;
                  
                  return (
                    <div key={message.id}>
                      {/* Refinement group header */}
                      {isStartOfRefinementGroup && message.refinementContext && (
                        <div className="mt-6 mb-2 flex items-center gap-2">
                          <div className="flex-grow border-t border-gray-200 dark:border-gray-700"></div>
                          <span className="px-2 text-xs font-medium text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-900">
                            Refining Section
                          </span>
                          <div className="flex-grow border-t border-gray-200 dark:border-gray-700"></div>
                        </div>
                      )}
                      
                      {/* Message container */}
                      <div 
                        className={`flex gap-3 ${
                          selectedMessageContent === message.content 
                            ? 'bg-blue-50 dark:bg-blue-900/20 p-2 rounded-lg'
                            : message.isRefinement || isAiResponseToRefinement
                              ? 'border-l-4 border-blue-400 dark:border-blue-600 pl-2'
                              : ''
                        } ${
                          message.isAiGenerated && !selectedMessageContent 
                            ? 'border border-green-200 dark:border-green-800 rounded-lg p-2 bg-green-50/30 dark:bg-green-900/10'
                            : ''
                        }`}
                        onClick={() => {
                          if (message.userId === 'ai-system' && isSpecificationContent(message.content)) {
                            setSelectedMessageContent(
                              selectedMessageContent === message.content ? null : message.content
                            );
                          }
                        }}
                      >
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center overflow-hidden">
                          {message.userPhotoURL ? (
                            <img 
                              src={message.userPhotoURL} 
                              alt={message.userName} 
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-blue-600 dark:text-blue-300 text-sm font-medium">
                              {message.userName.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 max-w-full overflow-hidden">
                          <div className="flex items-baseline gap-2">
                            <span className="font-medium text-gray-900 dark:text-white">
                              {message.userName}
                            </span>
                            <span className="text-xs text-gray-500">
                              {message.timestamp.toDate().toLocaleString()}
                            </span>
                            
                            {/* Enhanced actions for AI generated specifications */}
                            {message.userId === 'ai-system' && isSpecificationContent(message.content) && (
                              <div className="ml-auto flex gap-2">
                                {/* Spec selection button */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedMessageContent(
                                      selectedMessageContent === message.content ? null : message.content
                                    );
                                  }}
                                  className={`text-xs ${
                                    selectedMessageContent === message.content 
                                      ? 'text-green-600 dark:text-green-400' 
                                      : 'text-blue-600 dark:text-blue-400'
                                  } hover:underline flex items-center gap-1`}
                                >
                                  {selectedMessageContent === message.content ? (
                                    <>
                                      <Check className="w-3 h-3" />
                                      Selected
                                    </>
                                  ) : (
                                    'Select as Spec'
                                  )}
                                </button>
                                
                                {/* Refinement button for specifications */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (message.content) {
                                      handleRefineSection(message.content);
                                    }
                                  }}
                                  className="text-xs text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
                                >
                                  <Code className="w-3 h-3" />
                                  Refine This
                                </button>
                              </div>
                            )}
                          </div>
                          
                          {/* Show refinement context if present */}
                          {message.refinementContext && (
                            <div className="mt-1 text-xs bg-blue-50 dark:bg-blue-900/10 p-1 rounded text-blue-600 dark:text-blue-300 mb-2">
                              <span className="font-medium">Refining:</span> {message.refinementContext.substring(0, 100)}{message.refinementContext.length > 100 ? '...' : ''}
                            </div>
                          )}
                          
                          <div className="mt-1 prose dark:prose-invert prose-sm max-w-none overflow-x-auto break-words ticket-chat-content">
                            <MarkdownRenderer content={message.content} variant="chat" />
                          </div>
                          
                          {/* Show additional metadata for AI-generated content */}
                          {message.isAiGenerated && (
                            <div className="mt-2 flex justify-end">
                              <span className="text-xs text-gray-500 dark:text-gray-400 italic">
                                {isSpecificationContent(message.content) 
                                  ? "AI-generated specification" 
                                  : "AI-generated response"}
                              </span>
                            </div>
                          )}
                          
                          {/* Action buttons for AI messages with suggested actions */}
                          {message.userId === 'ai-system' && message.suggestedActions && (
                            <AIActionButtons 
                              actions={message.suggestedActions} 
                              onActionClick={handleActionClick}
                              disabled={isProcessingAction} 
                            />
                          )}
                          
                          {/* Show update button if this message is selected */}
                          {selectedMessageContent === message.content && (
                            <div className="mt-2 flex justify-end">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUpdateSpecification();
                                }}
                                className={`${commonStyles.button.base} ${commonStyles.button.primary} text-xs py-1 px-2 flex items-center gap-1`}
                              >
                                <FilePlus className="w-3 h-3" />
                                Update Specification
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
          {/* Chat Input */}
          <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <form onSubmit={handleMessageSubmit}>
              {refinementContext && (
                <div className="mb-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md text-sm text-blue-700 dark:text-blue-300">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 overflow-hidden">
                      <button 
                        type="button"
                        onClick={toggleRefinementExpansion}
                        className="font-medium mr-1 flex items-center hover:underline focus:outline-none"
                      >
                        <span className="mr-1">Refining:</span>
                        <ChevronRight className={`h-4 w-4 transition-transform ${isRefinementExpanded ? 'rotate-90' : ''}`} />
                        <span className="text-xs ml-1 underline">
                          {isRefinementExpanded ? 'Show less' : 'See all'}
                        </span>
                      </button>
                      {isRefinementExpanded ? (
                        <div className="mt-2 text-xs whitespace-pre-wrap overflow-auto max-h-[200px] p-2 bg-blue-100/50 dark:bg-blue-900/30 rounded border border-blue-200 dark:border-blue-800">
                          {refinementContext}
                        </div>
                      ) : (
                        <span className="text-xs">{refinementContext.substring(0, 100)}...</span>
                      )}
                    </div>
                    <div className="flex items-start">
                      <button
                        type="button"
                        onClick={() => setRefinementContext(null)}
                        className="ml-2 flex-shrink-0 text-blue-500 hover:text-blue-700 dark:hover:text-blue-400"
                        title="Cancel refinement"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <AutoResizeTextarea
                    ref={messageInputRef}
                    value={messageContent}
                    onChange={(e) => setMessageContent(e.target.value)}
                    placeholder={refinementContext ? "Provide details for refinement..." : "Type your message..."}
                    className={`${commonStyles.input} w-full py-2 min-h-[40px] max-h-[200px] resize-none`}
                    disabled={sendingMessage}
                    onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (messageContent.trim()) {
                          handleMessageSubmit(e as unknown as React.FormEvent);
                        }
                      }
                    }}
                  />
                  <div className="absolute right-2 bottom-2 text-xs text-gray-400">
                    Press Shift+Enter for line break
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={sendingMessage || !messageContent.trim()}
                  className={`${commonStyles.button.base} ${commonStyles.button.primary} ${(!messageContent.trim() || sendingMessage) ? 'opacity-50' : ''} self-end`}
                >
                  {sendingMessage ? (
                    <Loader className="w-4 h-4 animate-spin" />
                  ) : (
                    'Send'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      
      {/* Modal for viewing/editing */}
      <TicketModal
        ticket={selectedTicket}
        isOpen={!!selectedTicket}
        onClose={() => {
          setSelectedTicket(undefined);
        }}
        onSave={() => {
          // Refresh the current ticket data after save
          if (id) {
            const ticketRef = doc(db, 'tickets', id);
            getDoc(ticketRef).then(doc => {
              if (doc.exists()) {
                setTicket({ id: doc.id, ...doc.data() } as Ticket);
              }
            });
          }
        }}
      />
    </div>
  );
} 