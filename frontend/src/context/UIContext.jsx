import { createContext, useCallback, useContext, useState } from 'react';
import ConfirmDialog from '../components/modals/ConfirmDialog';
import CreateTicket from '../pages/Tickets/CreateTicket';

// App-wide dialogs: confirmation prompts and the "New ticket" dialog, which is
// opened from the top bar and from many pages with prefilled values.
const UIContext = createContext(null);

export function UIProvider({ children }) {
  const [confirmState, setConfirmState] = useState(null);
  const [newTicket, setNewTicket] = useState(null);

  const confirm = useCallback((opts) => new Promise((resolve) => setConfirmState({ ...opts, resolve })), []);
  const openNewTicket = useCallback((prefill = {}) => setNewTicket(prefill), []);

  return (
    <UIContext.Provider value={{ confirm, openNewTicket }}>
      {children}
      {confirmState && (
        <ConfirmDialog
          {...confirmState}
          onClose={(ok) => { confirmState.resolve(ok); setConfirmState(null); }}
        />
      )}
      {newTicket && <CreateTicket prefill={newTicket} onClose={() => setNewTicket(null)} />}
    </UIContext.Provider>
  );
}

export const useUI = () => useContext(UIContext);
