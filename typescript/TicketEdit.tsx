import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ticketService } from '../../services/ticketService';
import { Ticket } from '../../types/ticket';

export default function TicketEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  
  /**
   * Helper function to navigate back to the originating page
   * This centralizes the navigation logic and avoids code duplication
   */
  const navigateBack = () => {
    // Get the stored referrer URL
    const storedUrl = sessionStorage.getItem('ticketEditReferrer');
    
    // Clear the stored URL to avoid unintended redirects
    sessionStorage.removeItem('ticketEditReferrer');
    
    if (storedUrl) {
      console.log('[TicketEdit] Navigating back to:', storedUrl);
      
      // Handle different URL formats
      if (storedUrl.startsWith('http')) {
        // For absolute URLs, extract the path
        try {
          const urlObject = new URL(storedUrl);
          // Only navigate to internal paths
          if (urlObject.origin === window.location.origin) {
            navigate(urlObject.pathname + urlObject.search);
          } else {
            // For external URLs, default to tickets page
            navigate('/tickets');
          }
        } catch (error) {
          console.error('[TicketEdit] Error parsing URL:', error);
          navigate('/tickets');
        }
      } else {
        // For relative paths, navigate directly
        navigate(storedUrl);
      }
    } else {
      // Fall back to default behavior if no stored URL is found
      console.log('[TicketEdit] No referrer found, navigating to default page');
      navigate('/tickets');
    }
  };
  
  // Store the referring page URL in sessionStorage when component mounts
  useEffect(() => {
    // Get the referrer from document.referrer or from state passed via navigation
    const referrer = location.state?.from || document.referrer;
    
    // Only store if it's not from another edit page (to avoid loops)
    if (referrer && !referrer.includes('/tickets/edit')) {
      console.log('[TicketEdit] Storing referrer URL:', referrer);
      
      // If it's an internal app path, just store the pathname and search
      if (referrer.includes(window.location.origin)) {
        const url = new URL(referrer);
        sessionStorage.setItem('ticketEditReferrer', url.pathname + url.search);
      } else if (referrer.startsWith('/')) {
        // If it's a relative path, store it directly
        sessionStorage.setItem('ticketEditReferrer', referrer);
      } else {
        // For other cases (external URLs), store the full referrer
        sessionStorage.setItem('ticketEditReferrer', referrer);
      }
    }
  }, [location]);

  useEffect(() => {
    const loadTicket = async () => {
      if (id) {
        const ticketData = await ticketService.getTicket(id);
        setTicket(ticketData);
      }
      setLoading(false);
    };
    loadTicket();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ticket && id) {
      try {
        await ticketService.updateTicket(id, ticket);
        // Use the centralized navigation helper
        navigateBack();
      } catch (error) {
        console.error('[TicketEdit] Error updating ticket:', error);
        // Handle error case
      }
    }
  };

  if (loading) {
    return <div className="flex-1 p-4">Loading...</div>;
  }

  if (!ticket) {
    return <div className="flex-1 p-4">Ticket not found</div>;
  }

  return (
    <div className="flex-1 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2">Edit Ticket</h1>
          {ticket.ticket_id && (
            <p className="text-gray-600">Ticket ID: {ticket.ticket_id}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!ticket.ticket_id && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ticket ID
              </label>
              <input
                type="text"
                value={ticket.ticket_id || ''}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
                placeholder="Will be generated on save"
              />
            </div>
          )}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
              Title
            </label>
            <input
              type="text"
              id="title"
              value={ticket.title}
              onChange={(e) => setTicket({ ...ticket, title: e.target.value })}
              required
              className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2"
            />
          </div>
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
              Description
            </label>
            <textarea
              id="description"
              value={ticket.description}
              onChange={(e) => setTicket({ ...ticket, description: e.target.value })}
              rows={4}
              className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Status
              </label>
              <select
                id="status"
                value={ticket.status}
                onChange={(e) => setTicket({ ...ticket, status: e.target.value as Ticket['status'] })}
                className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2"
              >
                <option value="BACKLOG">Backlog</option>
                <option value="SELECTED_FOR_DEV">Selected for Dev</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="READY_FOR_TESTING">Ready for Testing</option>
                <option value="DEPLOYED">Deployed</option>
              </select>
            </div>
            <div>
              <label htmlFor="priority" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Priority
              </label>
              <select
                id="priority"
                value={ticket.priority}
                onChange={(e) => setTicket({ ...ticket, priority: e.target.value as Ticket['priority'] })}
                className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end space-x-2 pt-4">
            <button
              type="button"
              onClick={navigateBack}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}