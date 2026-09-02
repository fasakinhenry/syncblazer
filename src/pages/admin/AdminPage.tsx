import { useEffect, useState } from "react";
import {
  Devices,
  DownloadSimple,
  File as FileIcon,
  Globe,
  MagnifyingGlass,
  Note as NoteIcon,
  UsersThree,
} from "@phosphor-icons/react";
import { api } from "@/lib/api.ts";
import type { AdminOverview, AdminUser, AuthProvider } from "@/lib/types.ts";
import { formatRelativeTime } from "@/lib/format.ts";
import { AdminStatCard } from "@/components/admin/AdminStatCard.tsx";
import { AdminTrendChart } from "@/components/admin/AdminTrendChart.tsx";
import { AdminUserModal } from "@/components/admin/AdminUserModal.tsx";
import { Card } from "@/components/ui/Card.tsx";
import { Input } from "@/components/ui/Input.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { Badge } from "@/components/ui/Badge.tsx";
import { PageSpinner } from "@/components/ui/Spinner.tsx";

const PROVIDER_LABEL: Record<AuthProvider, string> = { password: "Email", google: "Google", guest: "Guest" };
const PROVIDER_TONE: Record<AuthProvider, "brand" | "success" | "neutral"> = {
  password: "brand",
  google: "success",
  guest: "neutral",
};

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function AdminPage() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState<AuthProvider | "all">("all");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const limit = 20;

  useEffect(() => {
    void api.admin.overview().then(setOverview);
  }, []);

  const loadUsers = () => {
    void api.admin
      .listUsers({ search: search || undefined, authProvider: providerFilter === "all" ? undefined : providerFilter, page, limit })
      .then((res) => {
        setUsers(res.users);
        setTotal(res.total);
        setTotalPages(res.totalPages);
      });
  };

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, providerFilter]);

  useEffect(() => {
    setPage(1);
    const t = setTimeout(loadUsers, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const blob = await api.admin.downloadUsersCsv();
      downloadBlob(blob, `syncblaze-users-${new Date().toISOString().slice(0, 10)}.csv`);
    } finally {
      setExporting(false);
    }
  };

  if (!overview) return <PageSpinner />;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Admin</h1>
          <p className="text-sm text-text-secondary">Usage, growth, and account management.</p>
        </div>
        <Button size="sm" variant="secondary" onClick={exportCsv} loading={exporting} className="gap-1.5">
          <DownloadSimple className="h-4 w-4" />
          Export users CSV
        </Button>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <AdminStatCard label="Users" value={overview.users.total} sublabel={`${overview.users.guest} guest`} icon={<UsersThree className="h-3.5 w-3.5" />} />
        <AdminStatCard label="Notes" value={overview.notes.total} sublabel={`${overview.notes.public} public`} icon={<NoteIcon className="h-3.5 w-3.5" />} />
        <AdminStatCard label="Rooms" value={overview.rooms.total} icon={<Globe className="h-3.5 w-3.5" />} />
        <AdminStatCard label="Devices" value={overview.devices.total} icon={<Devices className="h-3.5 w-3.5" />} />
        <AdminStatCard
          label="Transfers"
          value={overview.transfers.total}
          sublabel={`${overview.transfers.completed} completed`}
          icon={<FileIcon className="h-3.5 w-3.5" />}
        />
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <AdminStatCard label="Visits today" value={overview.visits.last24h} />
        <AdminStatCard label="Visits (7d)" value={overview.visits.last7d} />
        <AdminStatCard label="Visits (30d)" value={overview.visits.last30d} sublabel={`${overview.visits.uniqueLast30d} unique`} />
        <AdminStatCard label="Visits all-time" value={overview.visits.allTime} />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-semibold text-text-secondary">Visits — last 30 days</h2>
          <AdminTrendChart data={overview.visitTrend} label="Visits" />
        </Card>
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-semibold text-text-secondary">Signups — last 30 days</h2>
          <AdminTrendChart data={overview.signupTrend} label="Signups" />
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-sm font-semibold text-text-secondary">Users ({total})</h2>
          <div className="relative">
            <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
            <Input placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56 pl-9" />
          </div>
          {(["all", "password", "google", "guest"] as const).map((p) => (
            <button
              key={p}
              onClick={() => {
                setProviderFilter(p);
                setPage(1);
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                providerFilter === p ? "bg-brand text-white" : "bg-surface-hover text-text-secondary"
              }`}
            >
              {p === "all" ? "All" : PROVIDER_LABEL[p]}
            </button>
          ))}
        </div>

        <Card className="divide-y divide-border overflow-hidden">
          {users.length === 0 ? (
            <p className="p-6 text-center text-sm text-text-secondary">No users match this filter.</p>
          ) : (
            users.map((u) => (
              <button
                key={u.id}
                onClick={() => setSelectedUserId(u.id)}
                className="flex w-full items-center gap-3 p-3 text-left hover:bg-surface-hover"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">{u.name}</p>
                  <p className="truncate text-xs text-text-secondary">{u.email ?? "No email"}</p>
                </div>
                <Badge tone={PROVIDER_TONE[u.authProvider]}>{PROVIDER_LABEL[u.authProvider]}</Badge>
                <span className="hidden shrink-0 text-xs text-text-secondary sm:block">{formatRelativeTime(u.createdAt)}</span>
              </button>
            ))
          )}
        </Card>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-xs text-text-secondary">
              Page {page} of {totalPages}
            </span>
            <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        )}
      </section>

      <AdminUserModal userId={selectedUserId} onClose={() => setSelectedUserId(null)} onChanged={loadUsers} />
    </div>
  );
}
