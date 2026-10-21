"use client";

import BrandMark from "@/components/BrandMark";
import React, { useSyncExternalStore } from "react";
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

function subscribeMobile(notify: () => void) {
  const query = window.matchMedia('(max-width: 768px)'); query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
}
const mobileSnapshot = () => window.matchMedia('(max-width: 768px)').matches;
const desktopSnapshot = () => false;

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const mobile = useSyncExternalStore(subscribeMobile, mobileSnapshot, desktopSnapshot);
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
    <aside inert={mobile && !isOpen} className={`sidebar ${isOpen ? "mobile-open" : ""}`}>
      {/* Brand Header */}
      <div
        className="sidebar-1"
      >
        <div
          className="sidebar-2"
        >
          <BrandMark />
        </div>
        <div>
          <div
            className="sidebar-3"
          >
            SmartPharm
          </div>
          <div
            className="sidebar-4"
          >
            Pharmacy OS • Store #{user?.store_id ?? "—"}
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav id="main-navigation" aria-label="Main navigation"
        className="sidebar-5"
      >
        {navSections.map((section) => (
          <div key={section.title}>
            <div className="sidebar-section-title">{section.title}</div>
            <div className="sidebar-6">
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
                    aria-current={isActive ? "page" : undefined}
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
        className="sidebar-7"
      >
        <div className="sidebar-8">
          {/* Avatar */}
          <div
            className="sidebar-9"
          >
            {initials}
          </div>
          {/* Name + Role */}
          <div className="sidebar-10">
            <div
              className="sidebar-11"
            >
              {displayName}
            </div>
            <div className="sidebar-12">
              {displayRole}
            </div>
          </div>
        </div>

        {/* Online dot + Logout */}
        <div className="sidebar-13">
          <div
            className="sidebar-14"
            title="Online"
          />
          <button
            id="sidebar-logout-btn"
            onClick={handleLogout}
            title="Sign out"
            className="sidebar-15"
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
