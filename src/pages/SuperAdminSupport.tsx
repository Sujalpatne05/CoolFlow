import React, { useEffect, useMemo, useState } from "react";
import SuperAdminLayout from "../components/SuperAdminLayout";
import {
  AlertTriangle,
  CheckCircle,
  CirclePlus,
  Clock,
  MessageSquare,
  MoreVertical,
  Search,
  Siren,
} from "lucide-react";
import { apiRequest } from "@/lib/api";

type TicketStatus = "open" | "in-progress" | "resolved";

type Ticket = {
  id: number;
  ticket: string;
  subject: string;
  restaurant: string;
  status: TicketStatus;
  priority: "high" | "medium" | "low";
  assignee: string;
  sla: string;
  time: string;
};

function getStatusBadge(status: TicketStatus) {
  if (status === "open") return "bg-red-50 text-red-600 border-red-200";
  if (status === "in-progress") return "bg-teal-50 text-teal-700 border-teal-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
}

function getPriorityBadge(priority: TicketPriority) {
  if (priority === "high") return "bg-red-100 text-red-700";
  if (priority === "medium") return "bg-teal-100 text-teal-800";
  return "bg-slate-100 text-slate-700";
}

function TicketActions({
  ticket,
  onEdit,
  onResolve,
  onDelete,
}: {
  ticket: Ticket;
  onEdit: (ticket: Ticket) => void;
  onResolve: (ticket: Ticket) => void;
  onDelete: (ticket: Ticket) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-full hover:bg-slate-100" onClick={() => setOpen((value) => !value)} aria-label="Actions">
        <MoreVertical className="h-5 w-5 text-slate-500" />
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1.5 w-40 rounded-lg border border-slate-200 bg-white shadow-lg">
          <button className="block min-h-10 w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50" onClick={() => { setOpen(false); onEdit(ticket); }}>
            Edit
          </button>
          <button className="block min-h-10 w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50" onClick={() => { setOpen(false); onResolve(ticket); }}>
            Mark Resolved
          </button>
          <button className="block min-h-10 w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50" onClick={() => { setOpen(false); onDelete(ticket); }}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

export default function SuperAdminSupport() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [ticketList, setTicketList] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModal, setEditModal] = useState<{ open: boolean; ticket: Ticket | null }>({ open: false, ticket: null });
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; ticket: Ticket | null }>({ open: false, ticket: null });

  const loadTickets = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiRequest<Ticket[]>("/superadmin/support");
      setTicketList(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tickets");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTickets();
  }, []);

  const filteredTickets = useMemo(() => {
    return ticketList.filter((ticket) => {
      const statusMatch = statusFilter === "all" || ticket.status === statusFilter;
      const searchMatch =
        (ticket.subject || "").toLowerCase().includes(search.toLowerCase()) ||
        (ticket.restaurant || "").toLowerCase().includes(search.toLowerCase());
      return statusMatch && searchMatch;
    });
  }, [ticketList, statusFilter, search]);

  const stats = useMemo(() => {
    const open = ticketList.filter((ticket) => ticket.status === "open").length;
    const inProgress = ticketList.filter((ticket) => ticket.status === "in-progress").length;
    const resolved = ticketList.filter((ticket) => ticket.status === "resolved").length;
    return [
      { label: "Open Tickets", value: open, icon: <MessageSquare className="h-6 w-6 text-red-600" />, color: "bg-red-50 border-red-100", text: "text-red-700" },
      { label: "In Progress", value: inProgress, icon: <Clock className="h-6 w-6 text-teal-600" />, color: "bg-teal-50 border-teal-100", text: "text-teal-700" },
      { label: "Resolved", value: resolved, icon: <CheckCircle className="h-6 w-6 text-emerald-600" />, color: "bg-emerald-50 border-emerald-100", text: "text-emerald-700" },
    ];
  }, [ticketList]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const subject = (form.elements.namedItem("subject") as HTMLInputElement).value.trim();
    const restaurant = (form.elements.namedItem("restaurant") as HTMLInputElement).value.trim();
    setError("");
    try {
      await apiRequest("/superadmin/support", {
        method: "POST",
        body: JSON.stringify({ subject, restaurant, status: "open" }),
      });
      setCreateModalOpen(false);
      await loadTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ticket");
    }
  }

  function handleEdit(ticket: Ticket) {
    setEditModal({ open: true, ticket });
  }

  async function handleEditSave(subject: string, restaurant: string, status: TicketStatus) {
    if (!editModal.ticket) return;
    setError("");
    try {
      await apiRequest(`/superadmin/support/${editModal.ticket.id}`, {
        method: "PATCH",
        body: JSON.stringify({ subject, restaurant, status }),
      });
      setTicketList((current) =>
        current.map((ticket) => (ticket.id === editModal.ticket?.id ? { ...ticket, subject, restaurant, status } : ticket)),
      );
      setEditModal({ open: false, ticket: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update ticket");
    }
  }

  async function handleResolve(ticket: Ticket) {
    setError("");
    try {
      await apiRequest(`/superadmin/support/${ticket.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "resolved" }),
      });
      setTicketList((current) => current.map((item) => (item.id === ticket.id ? { ...item, status: "resolved", sla: "Met" } : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve ticket");
    }
  }

  function handleDelete(ticket: Ticket) {
    setDeleteModal({ open: true, ticket });
  }

  async function handleDeleteConfirm() {
    if (!deleteModal.ticket) return;
    setError("");
    try {
      await apiRequest(`/superadmin/support/${deleteModal.ticket.id}`, {
        method: "DELETE",
      });
      setTicketList((current) => current.filter((ticket) => ticket.id !== deleteModal.ticket?.id));
      setDeleteModal({ open: false, ticket: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete ticket");
    }
  }

  return (
    <SuperAdminLayout>
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 via-indigo-900 to-sky-900 px-4 py-6 text-white sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-extrabold sm:text-3xl">Support Command Desk</h1>
              <p className="mt-1 text-sm text-slate-200">Track SLA, assign ownership, and resolve tenant issues before escalation.</p>
            </div>
            <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100" onClick={() => setCreateModalOpen(true)}>
              <CirclePlus className="h-5 w-5" />
              Create Ticket
            </button>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {stats.map((stat) => (
            <article key={stat.label} className={`rounded-xl border p-4 shadow-sm ${stat.color}`}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">{stat.label}</p>
                {stat.icon}
              </div>
              <p className={`mt-2 text-3xl font-extrabold ${stat.text}`}>{stat.value}</p>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="relative md:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by subject or restaurant"
                className="w-full rounded-lg border border-slate-300 py-3 pl-9 pr-3 text-sm"
              />
            </label>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-3 text-sm">
              <option value="all">All Status</option>
              <option value="open">Open</option>
              <option value="in-progress">In Progress</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
          {error && <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>}
          {loading && <p className="mt-3 text-sm text-slate-500">Loading tickets...</p>}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">Ticket</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">Subject</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">Restaurant</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">Priority</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">Assignee</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">SLA</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">Status</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">Time</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500" />
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map((ticket) => (
                  <tr key={ticket.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-semibold text-slate-700">{ticket.ticket}</td>
                    <td className="px-4 py-3 text-slate-900">{ticket.subject}</td>
                    <td className="px-4 py-3 text-slate-700">{ticket.restaurant}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${getPriorityBadge(ticket.priority)}`}>{ticket.priority}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{ticket.assignee || "Unassigned"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${(ticket.sla || "").includes("left") ? "bg-teal-100 text-teal-800" : "bg-emerald-100 text-emerald-700"}`}>
                        {(ticket.sla || "").includes("left") ? <Siren className="h-3.5 w-3.5" /> : <CheckCircle className="h-3.5 w-3.5" />}
                        {ticket.sla || "N/A"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${getStatusBadge(ticket.status)}`}>{ticket.status}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{ticket.time}</td>
                    <td className="px-4 py-3">
                      <TicketActions ticket={ticket} onEdit={handleEdit} onResolve={handleResolve} onDelete={handleDelete} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!filteredTickets.length && (
            <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-slate-500">
              <AlertTriangle className="h-4 w-4" />
              No tickets found for current filters.
            </div>
          )}
        </section>

        {createModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
            <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl sm:p-6">
              <h2 className="text-xl font-bold text-slate-900">Create Support Ticket</h2>
              <form className="mt-4 space-y-3" onSubmit={handleCreate}>
                <input name="subject" required placeholder="Issue subject" className="w-full rounded-lg border border-slate-300 px-3 py-3 text-sm" />
                <input name="restaurant" required placeholder="Restaurant name" className="w-full rounded-lg border border-slate-300 px-3 py-3 text-sm" />
                <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                  <button type="button" className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700" onClick={() => setCreateModalOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="min-h-11 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                    Create Ticket
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {editModal.open && editModal.ticket && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl sm:p-6">
              <h2 className="text-xl font-bold text-slate-900">Edit Ticket {editModal.ticket.id}</h2>
              <form
                className="mt-4 space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  const subject = (form.elements.namedItem("subject") as HTMLInputElement).value;
                  const restaurant = (form.elements.namedItem("restaurant") as HTMLInputElement).value;
                  const status = (form.elements.namedItem("status") as HTMLSelectElement).value as TicketStatus;
                  void handleEditSave(subject, restaurant, status);
                }}
              >
                <input name="subject" defaultValue={editModal.ticket.subject} required className="w-full rounded-lg border border-slate-300 px-3 py-3 text-sm" />
                <input name="restaurant" defaultValue={editModal.ticket.restaurant} required className="w-full rounded-lg border border-slate-300 px-3 py-3 text-sm" />
                <select name="status" defaultValue={editModal.ticket.status} className="w-full rounded-lg border border-slate-300 px-3 py-3 text-sm">
                  <option value="open">Open</option>
                  <option value="in-progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                </select>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" className="min-h-10 rounded-lg border border-slate-300 px-4 py-2 text-sm" onClick={() => setEditModal({ open: false, ticket: null })}>
                    Cancel
                  </button>
                  <button type="submit" className="min-h-10 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">
                    Save
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {deleteModal.open && deleteModal.ticket && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl sm:p-6">
              <h2 className="text-xl font-bold text-slate-900">Delete Ticket</h2>
              <p className="mt-2 text-sm text-slate-600">
                Are you sure you want to delete <span className="font-semibold">{deleteModal.ticket.id}</span>? This action cannot be undone.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" className="min-h-10 rounded-lg border border-slate-300 px-4 py-2 text-sm" onClick={() => setDeleteModal({ open: false, ticket: null })}>
                  Cancel
                </button>
                <button type="button" className="min-h-10 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700" onClick={handleDeleteConfirm}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SuperAdminLayout>
  );
}
