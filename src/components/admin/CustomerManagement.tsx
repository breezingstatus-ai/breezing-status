import { useDialogs } from '../common/Dialogs';
import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Filter,
  Phone,
  Mail,
  Calendar,
  RefreshCw,
  Award,
  CheckCircle,
  AlertCircle,
  MoreVertical,
  ExternalLink,
  ShieldAlert,
  ArrowUpRight,
  Edit3,
  Clock,
  Camera,
  Video,
  X,
  Check,
  ChevronRight,
  Shield,
  UserCheck,
  UserX,
} from 'lucide-react';
import { AdminUserListItem, SubscriptionPackage, UserProfile } from '../../types';
import {
  getAllCustomers,
  getPackages,
  updateCustomerPlan,
  resetCustomerQuota,
  toggleCustomerStatus,
} from '../../lib/supabase';
import { getWhatsAppUrl } from '../../lib/phone';

interface CustomerManagementProps {
  onSelectCustomerRequests?: (customerPhoneOrName: string) => void;
}

export const CustomerManagement: React.FC<CustomerManagementProps> = ({
  onSelectCustomerRequests,
}) => {
  const [customers, setCustomers] = useState<AdminUserListItem[]>([]);
  const { confirm, notify } = useDialogs();
  const [packages, setPackages] = useState<SubscriptionPackage[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPackage, setFilterPackage] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(false);

  // Edit Plan Modal
  const [editingCustomer, setEditingCustomer] = useState<AdminUserListItem | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('free');
  const [selectedDurationDays, setSelectedDurationDays] = useState<number>(30);
  const [isSavingPlan, setIsSavingPlan] = useState(false);

  // Toast / Status Message
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    const [custList, pkgList] = await Promise.all([getAllCustomers(), getPackages()]);
    setCustomers(custList);
    setPackages(pkgList);
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const triggerToast = (msg: string) => {
    setActionSuccessMsg(msg);
    setTimeout(() => setActionSuccessMsg(null), 3000);
  };

  // Filter customers
  const filteredCustomers = customers.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      c.full_name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.whatsapp_number.includes(q);

    const matchesPackage = filterPackage === 'all' || c.package_id === filterPackage;
    const matchesStatus = filterStatus === 'all' || c.status === filterStatus;

    return matchesSearch && matchesPackage && matchesStatus;
  });

  // Analytics Metrics
  const totalCustomers = customers.length;
  const activeSubscribers = customers.filter((c) => c.package_id !== 'free').length;
  const freeUsers = customers.filter((c) => c.package_id === 'free').length;
  const totalRequestsSubmitted = customers.reduce((acc, curr) => acc + (curr.requests_count || 0), 0);

  const handleOpenPlanModal = (customer: AdminUserListItem) => {
    setEditingCustomer(customer);
    setSelectedPlanId(customer.package_id || 'free');
    setSelectedDurationDays(30);
  };

  const handleSavePlan = async () => {
    if (!editingCustomer) return;
    setIsSavingPlan(true);
    try {
    await updateCustomerPlan(editingCustomer.id, selectedPlanId, selectedDurationDays);
    setIsSavingPlan(false);
    setEditingCustomer(null);
    await loadData();
    triggerToast(`Updated ${editingCustomer.full_name}'s subscription plan!`);
    } catch(error) { await notify(error instanceof Error ? error.message : 'Plan update failed'); }
    finally { setIsSavingPlan(false); }
  };

  const handleResetQuota = async (customer: AdminUserListItem) => {
    if (await confirm(`Reset ${customer.full_name} to the Free package and clear current monthly usage?`)) {
      try {
      await resetCustomerQuota(customer.id);
      await loadData();
      triggerToast(`${customer.full_name} reset to Free.`);
      } catch(error) { await notify(error instanceof Error ? error.message : "Reset failed"); }
    }
  };

  const handleToggleStatus = async (customer: AdminUserListItem) => {
    const nextStatus = customer.status === 'active' ? 'suspended' : 'active';
    const actionText = nextStatus === 'active' ? 'reactivate' : 'suspend';
    if (await confirm(`Are you sure you want to ${actionText} ${customer.full_name}'s account?`)) {
      try {
      await toggleCustomerStatus(customer.id, nextStatus);
      await loadData();
      triggerToast(`Account status set to ${nextStatus}.`);
      } catch(error) { await notify(error instanceof Error ? error.message : "Status update failed"); }
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {actionSuccessMsg && (
        <div className="fixed top-20 right-4 z-50 p-3.5 rounded-2xl bg-[#173B2A] text-white shadow-xl text-xs font-semibold flex items-center gap-2 animate-bounce">
          <CheckCircle className="w-4 h-4 text-[#58C994]" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-white dark:bg-[#1A241E] border border-[#E4EAE5] dark:border-[#334539] shadow-sm">
          <span className="text-[11px] font-semibold text-[#748078] dark:text-[#A7B8AC] uppercase tracking-wider">
            Total Customers
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-[#19241E] dark:text-[#F2F6F2]">
              {totalCustomers}
            </span>
            <Users className="w-4 h-4 text-[#21A36B]" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#1A241E] border border-[#E4EAE5] dark:border-[#334539] shadow-sm">
          <span className="text-[11px] font-semibold text-[#748078] dark:text-[#A7B8AC] uppercase tracking-wider">
            Active Paid Plans
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-[#21A36B]">
              {activeSubscribers}
            </span>

          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#1A241E] border border-[#E4EAE5] dark:border-[#334539] shadow-sm">
          <span className="text-[11px] font-semibold text-[#748078] dark:text-[#A7B8AC] uppercase tracking-wider">
            Free Tier Users
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-[#19241E] dark:text-[#F2F6F2]">
              {freeUsers}
            </span>
            <Award className="w-4 h-4 text-[#748078]" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#1A241E] border border-[#E4EAE5] dark:border-[#334539] shadow-sm">
          <span className="text-[11px] font-semibold text-[#748078] dark:text-[#A7B8AC] uppercase tracking-wider">
            Lifetime Requests
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-[#19241E] dark:text-[#F2F6F2]">
              {totalRequestsSubmitted}
            </span>
            <Camera className="w-4 h-4 text-[#21A36B]" />
          </div>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#1A241E] border border-[#E4EAE5] dark:border-[#334539] shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#748078]" />
            <input
              type="text"
              placeholder="Search by name, phone (+265...), or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#E4EAE5] dark:border-[#334539] bg-[#F8F9F7] dark:bg-[#101713] text-xs focus:outline-none focus:border-[#21A36B] transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#748078]"
              >
                Clear
              </button>
            )}
          </div>

          {/* Filter Package Dropdown */}
          <select
            value={filterPackage}
            onChange={(e) => setFilterPackage(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-[#E4EAE5] dark:border-[#334539] bg-[#F8F9F7] dark:bg-[#101713] text-xs font-medium focus:outline-none focus:border-[#21A36B]"
          >
            <option value="all">All Plans</option>
            <option value="free">Free Plan</option>
            <option value="premium">Premium</option>
            <option value="business">Business Pro</option>
          </select>

          {/* Filter Status Dropdown */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-[#E4EAE5] dark:border-[#334539] bg-[#F8F9F7] dark:bg-[#101713] text-xs font-medium focus:outline-none focus:border-[#21A36B]"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>

          <button
            onClick={loadData}
            className="px-3.5 py-2.5 rounded-xl border border-[#E4EAE5] dark:border-[#334539] hover:bg-[#F1F5F1] dark:hover:bg-[#25332A] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            title="Refresh customer data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Customers List / Grid */}
      {customers.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-[#1A241E] border border-dashed border-[#E4EAE5] dark:border-[#334539] space-y-2">
          <Users className="w-10 h-10 mx-auto text-[#748078] opacity-50" />
          <h4 className="font-bold text-sm text-[#19241E] dark:text-[#F2F6F2]">
            0 customers
          </h4>
          <p className="text-xs text-[#748078] dark:text-[#A7B8AC]">
            No customers have registered yet. Real customer profiles will appear here when users sign up.
          </p>
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-[#1A241E] border border-[#E4EAE5] dark:border-[#334539] space-y-2">
          <Users className="w-10 h-10 mx-auto text-[#748078] opacity-50" />
          <h4 className="font-bold text-sm text-[#19241E] dark:text-[#F2F6F2]">
            No customers match your search
          </h4>
          <p className="text-xs text-[#748078] dark:text-[#A7B8AC]">
            Try clearing filters or search terms to display all customer records.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredCustomers.map((customer) => {
            const pkg = packages.find((p) => p.id === customer.package_id) || {
              id: 'free',
              name: 'Free',
            };
            const picPercent = Math.min(
              100,
              Math.round(((customer.pictures_used || 0) / (customer.pictures_allowed || 30)) * 100)
            );
            const vidPercent = Math.min(
              100,
              Math.round(((customer.videos_used || 0) / (customer.videos_allowed || 2)) * 100)
            );
            const isSuspended = customer.status === 'suspended';
            const joinedDate = new Date(customer.created_at).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            });

            const waDirectLink = customer.whatsapp_number
              ? getWhatsAppUrl(
                  customer.whatsapp_number,
                  `Hello ${customer.full_name}, this is Breezing Status HD administration.`
                )
              : null;

            return (
              <div
                key={customer.id}
                className={`p-4 rounded-2xl bg-white dark:bg-[#1A241E] border transition-all shadow-sm space-y-3.5 ${
                  isSuspended
                    ? 'border-red-200 dark:border-red-900/50 opacity-80'
                    : 'border-[#E4EAE5] dark:border-[#334539] hover:border-[#21A36B]'
                }`}
              >
                {/* Header: Avatar, Name, Badges */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {/* Customer Avatar */}
                    {customer.avatar_url ? (
                      <img
                        src={customer.avatar_url}
                        alt={customer.full_name}
                        className="w-11 h-11 rounded-2xl object-cover border border-[#E4EAE5] dark:border-[#334539] shadow-sm"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-2xl bg-[#173B2A] dark:bg-[#58C994] text-white dark:text-[#101713] flex items-center justify-center font-bold text-sm shadow-sm">
                        {customer.full_name?.charAt(0) || 'U'}
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-xs truncate text-[#19241E] dark:text-[#F2F6F2]">
                          {customer.full_name}
                        </h4>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                            isSuspended
                              ? 'bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400'
                              : 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {customer.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#748078] dark:text-[#A7B8AC] truncate flex items-center gap-1">
                        <Mail className="w-3 h-3 shrink-0" />
                        <span className="truncate">{customer.email}</span>
                      </p>
                    </div>
                  </div>

                  {/* Plan Badge */}
                  <span
                    className={`shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-xl uppercase tracking-wider ${
                      customer.package_id === 'business'
                        ? 'bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300'
                        : customer.package_id === 'premium'
                        ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
                        : 'bg-[#F1F5F1] dark:bg-[#25332A] text-[#19241E] dark:text-[#F2F6F2]'
                    }`}
                  >
                    {pkg.name}
                  </span>
                </div>

                {/* Contact & Meta Row */}
                <div className="p-2.5 rounded-xl bg-[#F8F9F7] dark:bg-[#101713] border border-[#E4EAE5] dark:border-[#334539] text-xs grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-[#748078] dark:text-[#A7B8AC] block">
                      WhatsApp Number
                    </span>
                    <span className="font-mono font-bold text-xs text-[#19241E] dark:text-[#F2F6F2]">
                      {customer.whatsapp_number || 'Not provided'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#748078] dark:text-[#A7B8AC] block">
                      Customer Since
                    </span>
                    <span className="text-xs text-[#19241E] dark:text-[#F2F6F2]">
                      {joinedDate}
                    </span>
                  </div>
                </div>

                {/* Monthly Usage Quotas Bar */}
                <div className="space-y-1.5 text-xs">
                  {/* Pictures Bar */}
                  <div>
                    <div className="flex justify-between text-[11px] text-[#748078] dark:text-[#A7B8AC] mb-1">
                      <span className="flex items-center gap-1">
                        <Camera className="w-3 h-3 text-[#21A36B]" />
                        <span>Pictures This Month:</span>
                      </span>
                      <span className="font-bold text-[#19241E] dark:text-[#F2F6F2]">
                        {customer.pictures_used} / {customer.pictures_allowed}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[#E4EAE5] dark:bg-[#334539] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          picPercent >= 90 ? 'bg-red-500' : 'bg-[#21A36B]'
                        }`}
                        style={{ width: `${picPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Videos Bar */}
                  <div>
                    <div className="flex justify-between text-[11px] text-[#748078] dark:text-[#A7B8AC] mb-1">
                      <span className="flex items-center gap-1">
                        <Video className="w-3 h-3 text-purple-500" />
                        <span>Videos This Month:</span>
                      </span>
                      <span className="font-bold text-[#19241E] dark:text-[#F2F6F2]">
                        {customer.videos_used} / {customer.videos_allowed}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[#E4EAE5] dark:bg-[#334539] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          vidPercent >= 90 ? 'bg-red-500' : 'bg-purple-500'
                        }`}
                        style={{ width: `${vidPercent}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Action Toolbar */}
                <div className="pt-2 border-t border-[#E4EAE5] dark:border-[#334539] flex flex-wrap items-center gap-2">
                  {/* Chat on WhatsApp */}
                  {waDirectLink && (
                    <a
                      href={waDirectLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#128C7E] dark:text-[#25D366] text-xs font-bold transition-colors"
                      title="Open direct WhatsApp conversation"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                    </a>
                  )}

                  {/* Change Plan Button */}
                  <button
                    onClick={() => handleOpenPlanModal(customer)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#F1F5F1] dark:bg-[#25332A] hover:bg-[#E4EAE5] dark:hover:bg-[#334539] text-[#19241E] dark:text-[#F2F6F2] text-xs font-semibold transition-colors"
                  >

                    <span>Plan</span>
                  </button>

                  {/* Reset Quota Button */}
                  <button
                    onClick={() => handleResetQuota(customer)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[#748078] hover:bg-[#F1F5F1] dark:hover:bg-[#25332A] text-xs font-medium transition-colors"
                    title="Reset monthly media usage counters"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span className="hidden sm:inline">Reset</span>
                  </button>

                  {/* Filter Requests by this Customer */}
                  {onSelectCustomerRequests && (
                    <button
                      onClick={() => onSelectCustomerRequests(customer.whatsapp_number || customer.full_name)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[#748078] hover:bg-[#F1F5F1] dark:hover:bg-[#25332A] text-xs font-medium transition-colors"
                      title="View all requests from this customer"
                    >
                      <Camera className="w-3 h-3" />
                      <span>{customer.requests_count || 0} reqs</span>
                    </button>
                  )}

                  {/* Suspend / Activate Toggle */}
                  <button
                    onClick={() => handleToggleStatus(customer)}
                    className={`ml-auto p-1.5 rounded-xl text-xs transition-colors ${
                      isSuspended
                        ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                        : 'text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30'
                    }`}
                    title={isSuspended ? 'Reactivate customer' : 'Suspend customer'}
                  >
                    {isSuspended ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Plan Modal */}
      {editingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#1A241E] p-6 shadow-2xl border border-[#E4EAE5] dark:border-[#334539] text-[#19241E] dark:text-[#F2F6F2] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E4EAE5] dark:border-[#334539]">
              <div>
                <h3 className="font-bold text-sm">Change Customer Plan</h3>
                <p className="text-xs text-[#748078] dark:text-[#A7B8AC]">
                  {editingCustomer.full_name}
                </p>
              </div>
              <button
                onClick={() => setEditingCustomer(null)}
                className="p-1 rounded-lg text-[#748078] hover:bg-[#F1F5F1] dark:hover:bg-[#25332A]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Select Subscription Tier</label>
                <div className="space-y-2">
                  {packages.map((pkg) => (
                    <label
                      key={pkg.id}
                      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                        selectedPlanId === pkg.id
                          ? 'border-[#21A36B] bg-[#21A36B]/10 font-bold'
                          : 'border-[#E4EAE5] dark:border-[#334539] bg-[#F8F9F7] dark:bg-[#101713]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="planSelection"
                          value={pkg.id}
                          checked={selectedPlanId === pkg.id}
                          onChange={() => setSelectedPlanId(pkg.id)}
                          className="accent-[#21A36B]"
                        />
                        <div>
                          <span className="font-bold block">{pkg.name}</span>
                          <span className="text-[11px] text-[#748078] dark:text-[#A7B8AC] font-normal">
                            {pkg.monthly_pictures} pics · {pkg.monthly_videos} vids
                          </span>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-xs">
                        {pkg.price === 0 ? 'Free' : `${pkg.price} MWK`}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-semibold block mb-1">Plan Duration</label>
                <select
                  value={selectedDurationDays}
                  onChange={(e) => setSelectedDurationDays(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-[#E4EAE5] dark:border-[#334539] bg-[#F8F9F7] dark:bg-[#101713] text-xs font-medium"
                >
                  <option value={7}>7 Days (Trial / Weekly)</option>
                  <option value={30}>30 Days (Standard Monthly)</option>
                  <option value={90}>90 Days (Quarterly Pass)</option>
                  <option value={365}>365 Days (Annual VIP)</option>
                </select>
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setEditingCustomer(null)}
                className="flex-1 py-2.5 rounded-xl border border-[#E4EAE5] dark:border-[#334539] text-xs font-semibold hover:bg-[#F1F5F1] dark:hover:bg-[#25332A]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingPlan}
                onClick={handleSavePlan}
                className="flex-1 py-2.5 rounded-xl bg-[#173B2A] dark:bg-[#58C994] text-white dark:text-[#101713] text-xs font-bold hover:opacity-95 disabled:opacity-50"
              >
                {isSavingPlan ? 'Saving...' : 'Confirm Upgrade'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
