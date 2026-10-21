"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  ClipboardList,
  Package,
  Bookmark,
  FileText,
  Building2,
  Clock,
  MapPin,
  CheckCircle2,
  Settings,
  LogOut,
  RotateCcw,
  Wallet,
  Users,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number }>;
  roles?: string[];
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
    ],
  },
  {
    title: "Counter & Dispensing",
    items: [
      { label: "POS Billing", href: "/pos", icon: ShoppingBag },
      { label: "Prescriptions", href: "/prescriptions", icon: ClipboardList },
      { label: "Sales Returns", href: "/returns", icon: RotateCcw },
    ],
  },
  {
    title: "Catalog & Stock",
    items: [
      { label: "Inventory & Batches", href: "/inventory", icon: Package },
      { label: "Medicines Catalog", href: "/medicines", icon: Bookmark },
      { label: "Expiry Management", href: "/expiry", icon: Clock },
      { label: "Shelves & Storage", href: "/shelves", icon: MapPin },
    ],
  },
  {
    title: "Procurement",
    items: [
      { label: "Purchases & Invoices", href: "/purchases", icon: FileText },
      { label: "Suppliers", href: "/suppliers", icon: Building2 },
    ],
  },
  {
    title: "Governance",
    items: [
      { label: "Expenses & Profit", href: "/expenses", icon: Wallet, roles: ["owner", "manager"] },
      { label: "Branches & Transfers", href: "/branches", icon: Building2, roles: ["owner", "manager"] },
      { label: "Team & Access", href: "/team", icon: Users, roles: ["owner", "manager"] },
      { label: "Audit Trail", href: "/audit", icon: CheckCircle2 },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

/** Map backend role enum values to human-readable labels. */
function formatRole(role: string): string {
  const map: Record<string, string> = {
    owner: "Owner",
    manager: "Manager",
    pharmacist: "Pharmacist",
    cashier: "Cashier",
    inventory_staff: "Inventory Staff",
  };
  return map[role?.toLowerCase()] ?? role;
}

/** Get the initials from a full name (up to 2 characters). */
function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    onClose?.();
    router.replace("/login");
  };

  const displayName = user?.full_name ?? "Staff";
  const displayRole = user?.role ? formatRole(user.role) : "Terminal";
  const initials = getInitials(displayName);

  return (
    <aside className={`sidebar ${isOpen ? "mobile-open" : ""}`}>
      {/* Brand Header */}
      <div
        style={{
          height: "var(--header-height)",
          minHeight: "var(--header-height)",
          maxHeight: "var(--header-height)",
          padding: "0 1.25rem",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          backgroundColor: "var(--bg-sidebar)",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "#252525",
            border: "1px solid #393939",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--brand-primary)",
          }}
        >
          <Package size={16} />
        </div>
        <div>
          <div
            style={{
              fontSize: "0.875rem",
              fontWeight: 700,
              color: "var(--text-primary)",
              lineHeight: 1.2,
            }}
          >
            SmartPharm
          </div>
          <div
            style={{
              fontSize: "0.6875rem",
              color: "var(--text-muted)",
              marginTop: "2px",
            }}
          >
            Pharmacy OS • Store #{user?.store_id ?? "—"}
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "1rem 0.75rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
        }}
      >
        {navSections.map((section) => (
          <div key={section.title}>
            <div className="sidebar-section-title">{section.title}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {section.items.filter((item) => !item.roles || item.roles.includes(user?.role ?? "")).map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                const IconComponent = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => onClose?.()}
                    className={`sidebar-link ${isActive ? "active" : ""}`}
                  >
                    <span className="sidebar-icon">
                      <IconComponent size={16} />
                    </span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer / User Session */}
      <div
        style={{
          minHeight: "56px",
          padding: "0.625rem 1.25rem",
          borderTop: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "0.75rem",
          backgroundColor: "var(--bg-sidebar)",
          boxSizing: "border-box",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", minWidth: 0 }}>
          {/* Avatar */}
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              backgroundColor: "#1e3a5f",
              border: "1px solid #1e6ee8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.6875rem",
              fontWeight: 700,
              color: "#87d1ff",
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
          {/* Name + Role */}
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                color: "var(--text-primary)",
                fontWeight: 700,
                lineHeight: 1.2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "130px",
              }}
            >
              {displayName}
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.6875rem" }}>
              {displayRole}
            </div>
          </div>
        </div>

        {/* Online dot + Logout */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
          <div
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              backgroundColor: "var(--status-high-text)",
            }}
            title="Online"
          />
          <button
            id="sidebar-logout-btn"
            onClick={handleLogout}
            title="Sign out"
            style={{
              width: "26px",
              height: "26px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "var(--radius-sm)",
              background: "transparent",
              border: "1px solid transparent",
              color: "var(--text-muted)",
              cursor: "pointer",
              transition: "background-color 0.12s ease, color 0.12s ease, border-color 0.12s ease",
            }}
            onMouseEnter={(e) => {
              const btn = e.currentTarget;
              btn.style.backgroundColor = "rgba(255,80,80,0.1)";
              btn.style.color = "#ff8080";
              btn.style.borderColor = "rgba(255,80,80,0.2)";
            }}
            onMouseLeave={(e) => {
              const btn = e.currentTarget;
              btn.style.backgroundColor = "transparent";
              btn.style.color = "var(--text-muted)";
              btn.style.borderColor = "transparent";
            }}
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </aside>
  );
}
