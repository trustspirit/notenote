import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { useEffect, useState } from "react";
import { auth, googleProvider } from "../lib/firebase";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUser(u);
    setLoading(false);
  }), []);

  return {
    user,
    loading,
    signIn: () => signInWithPopup(auth, googleProvider),
    signOut: () => signOut(auth),
  };
}
