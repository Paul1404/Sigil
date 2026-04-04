import { createContext, useContext, useState, useEffect } from "react";
import { api } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("sigil_token"));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    // Verify the token is still valid
    fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) {
          localStorage.removeItem("sigil_token");
          setToken(null);
        }
      })
      .catch(() => {
        localStorage.removeItem("sigil_token");
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const login = async (password) => {
    const data = await api.login(password);
    localStorage.setItem("sigil_token", data.token);
    setToken(data.token);
  };

  const logout = () => {
    localStorage.removeItem("sigil_token");
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
