import AsyncStorage from "@react-native-async-storage/async-storage";

import { createTermsGate, TERMS_STORAGE_KEY } from "./termsAgreement";

export const termsGate = createTermsGate({
  read: () => AsyncStorage.getItem(TERMS_STORAGE_KEY),
  write: (value) => AsyncStorage.setItem(TERMS_STORAGE_KEY, value),
});
