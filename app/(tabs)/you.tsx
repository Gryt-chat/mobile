import { YouScreen } from "../../src/shell/YouScreen";

/**
 * The You tab.
 *
 * A real route now, not a sheet. It is the only one of the three that is not
 * about a server, which is the reason it survived the "there is nothing for the
 * navbar to be about" argument when the app has no servers joined — sign-in,
 * identity, settings and feedback are all here, and the person most likely to
 * need them is the one who has not joined anything.
 */
export default YouScreen;
