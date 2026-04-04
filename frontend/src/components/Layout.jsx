import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Globe,
  Settings,
  Shield,
  LogOut,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/reports", icon: FileText, label: "Reports" },
  { to: "/dns", icon: Globe, label: "DNS Health" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function Layout() {
  const { logout } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-indigo-400" />
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                Sigil
              </h1>
              <p className="text-xs text-gray-500">
                Email authentication, made visible.
              </p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-indigo-500/10 text-indigo-400"
                    : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                }`
              }
            >
              <Icon className="w-5 h-5" />
              {label}
            </NavLink>
          ))}
        </nav>
          <div className="p-4 border-t border-gray-800 space-y-3">
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors w-full"
          >
            <LogOut className="w-5 h-5" />
            Sign out
          </button>
          <p className="text-xs text-gray-600 text-center">Sigil v1.0</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-gray-950 p-8">
        <Outlet />
      </main>
    </div>
  );
}
