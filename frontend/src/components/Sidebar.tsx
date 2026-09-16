"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Dashboard,
  ShoppingBag,
  Clipboard,
  Box,
  Bookmark,
  File,
  Building,
  Clock,
  Location,
  CheckCircle,
  Settings,
} from "@duo-icons/react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number }>;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/", icon: Dashboard },
    ],
  },
  {
    title: "Counter & Dispensing",
    items: [
      { label: "POS Billing", href: "/pos", icon: ShoppingBag },
      { label: "Prescriptions", href: "/prescriptions", icon: Clipboard },
    ],
  },
  {
    title: "Catalog & Stock",
    items: [
      { label: "Inventory & Batches", href: "/inventory", icon: Box },
      { label: "Medicines Catalog", href: "/medicines", icon: Bookmark },
      { label: "Expiry Management", href: "/expiry", icon: Clock },
      { label: "Shelves & Storage", href: "/shelves", icon: Location },
    ],
  },
  {
    title: "Procurement",
    items: [
      { label: "Purchases & Invoices", href: "/purchases", icon: File },
      { label: "Suppliers", href: "/suppliers", icon: Building },
    ],
  },
  {
    title: "Governance",
    items: [
      { label: "Audit Trail", href: "/audit", icon: CheckCircle },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      {/* Brand Header — Exact 64px matching top page-header */}
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
          <Box size={16} />
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
            Pharmacy OS • Store #1
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
              {section.items.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                const IconComponent = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
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
          height: "56px",
          minHeight: "56px",
          padding: "0 1.25rem",
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
        <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              backgroundColor: "#252525",
              border: "1px solid #393939",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "#ffffff",
            }}
          >
            P
          </div>
          <div>
            <div style={{ color: "var(--text-primary)", fontWeight: 700, lineHeight: 1.2 }}>
              Pharmacist
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.6875rem" }}>
              Terminal Active
            </div>
          </div>
        </div>
        <div
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            backgroundColor: "var(--status-high-text)",
          }}
          title="Online"
        />
      </div>
    </aside>
  );
}
