import { createContext, useContext, type ReactNode } from "react";

import { useAccount, type Account } from "./useAccount";

/**
 * One account, shared by every screen.
 *
 * At the root rather than inside the tabs, unlike the server connection: the
 * account outlives whichever server is being looked at, and the session should
 * not be re-read every time the tabs remount.
 */
const AccountContext = createContext<Account | null>(null);

export function useGrytAccount(): Account {
  const value = useContext(AccountContext);
  if (!value) throw new Error("useGrytAccount must be used inside AccountProvider.");
  return value;
}

export function AccountProvider({ children }: { children?: ReactNode }) {
  const account = useAccount();
  return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
}
