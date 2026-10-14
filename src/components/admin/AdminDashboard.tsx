import React, { useState, useEffect } from 'react';
import {
  Search,
  Download,
  ExternalLink,
  CheckCircle,
  Clock,
  Trash2,
  Eye,
  Archive,
  Copy,
  Check,
  RefreshCw,
  Sparkles,
  Phone,
  X,
  ChevronLeft,
  ChevronRight,
  Layers,
  AlertCircle,
  Users,
} from 'lucide-react';
import JSZip from 'jszip';
import { UploadRequest, RequestStatus } from '../../types';
import {
  getUploadRequests,
  updateRequestStatus,
  deleteUploadRequest,
  getFailedDeletionAssets,
} from '../../lib/supabase';
import { getWhatsAppUrl, formatDownloadFilename } from '../../lib/phone';
import { CustomerManagement } from './CustomerManagement';

interface AdminDashboardProps {
  onOpenSettings: () => void;
  onViewCustomerApp?: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onOpenSettings, onViewCustomerApp }) => {
  const [adminTab, setAdminTab] = useState<'requests' | 'customers'>('requests');
  const [requests, setRequests] = useState<UploadRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedPreviewReq, setSelectedPreviewReq] = useState<UploadRequest | null>(null);
  const [previewMediaIndex, setPreviewMediaIndex] = useState<number>(0);
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  const [isZipping, setIsZipping] = useState<string | null>(null);
  const [isDownloadingSeparately, setIsDownloadingSeparately] = useState<string | null>(null);
  const [confirmSendId, setConfirmSendId] = useState<string | null>(null);
  const [failedCleanups, setFailedCleanups] = useState<any[]>([]);

  const loadRequests = async () => {
    const list = await getUploadRequests();
    setRequests(list);
    const failed = await getFailedDeletionAssets();
    setFailedCleanups(failed);
  };

  useEffect(() => {
    loadRequests();
  }, []);

  // Filter requests
  const filteredRequests = requests.filter((req) => {
    const matchesFilter = filterStatus === 'all' ? true : req.status === filterStatus;
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !query ||
      req.customer_name.toLowerCase().includes(query) ||
      req.customer_email.toLowerCase().includes(query) ||
      req.customer_phone.includes(query) ||
      req.request_code.toLowerCase().includes(query);

    return matchesFilter && matchesSearch;
  });

  // Calculate statistics
  const newCount = requests.filter((r) => r.status === 'pending').length;
  const pendingCount = requests.filter((r) => r.status === 'pending' || r.status === 'processing').length;
  const sentTodayCount = requests.filter((r) => {
    if (r.status !== 'sent') return false;
    const created = new Date(r.created_at);
    const today = new Date();
    return created.toDateString() === today.toDateString();
  }).length;
  const picturesWaiting = requests
    .filter((r) => (r.status === 'pending' || r.status === 'downloaded') && r.media_type === 'image')
    .reduce((acc, curr) => acc + curr.media_count, 0);
  const videosWaiting = requests
    .filter((r) => (r.status === 'pending' || r.status === 'downloaded') && r.media_type === 'video')
    .reduce((acc, curr) => acc + curr.media_count, 0);

  const handleCopyPhone = (phone: string) => {
    navigator.clipboard.writeText(phone);
    setCopiedPhone(phone);
    setTimeout(() => setCopiedPhone(null), 2000);
  };

  const handleStatusChange = async (requestId: string, newStatus: RequestStatus) => {
    await updateRequestStatus(requestId, newStatus);
    await loadRequests();
  };

  const handleConfirmSent = async (requestId: string) => {
    await updateRequestStatus(requestId, 'sent');
    setConfirmSendId(null);
    await loadRequests();
  };

  const handleDelete = async (requestId: string) => {
    if (confirm('Are you sure you want to delete this customer request?')) {
      await deleteUploadRequest(requestId);
      await loadRequests();
    }
  };

  // Helper to download a single file blob with specific filename
  const triggerFileDownload = async (url: string, filename: string) => {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  };

  // Download single asset
  const handleDownloadAsset = async (req: UploadRequest, index: number) => {
    const asset = req.assets?.[index];
    if (!asset) return;

    const ext = asset.format || (req.media_type === 'image' ? 'jpg' : 'mp4');
    const filename = formatDownloadFilename(req.customer_name, req.customer_phone, index, ext);

    try {
      await triggerFileDownload(asset.secure_url, filename);
      if (req.status === 'pending') {
        await handleStatusChange(req.id, 'downloaded');
      }
    } catch {
      window.open(asset.secure_url, '_blank');
    }
  };

  // PART 8: Download All Separately (individual files saved sequentially)
  const handleDownloadAllSeparately = async (req: UploadRequest) => {
    if (!req.assets || req.assets.length === 0) return;

    setIsDownloadingSeparately(req.id);
    try {
      for (let i = 0; i < req.assets.length; i++) {
        const asset = req.assets[i];
        const ext = asset.format || (req.media_type === 'image' ? 'jpg' : 'mp4');
        const filename = formatDownloadFilename(req.customer_name, req.customer_phone, i, ext);

        await triggerFileDownload(asset.secure_url, filename);
        // Small interval between downloads to prevent browser multi-download blockage
        await new Promise((r) => setTimeout(r, 600));
      }

      if (req.status === 'pending') {
        await handleStatusChange(req.id, 'downloaded');
      }
    } catch (err) {
      alert('Your browser may have restricted multiple simultaneous downloads. Use individual downloads or Download ZIP.');
      console.error(err);
    } finally {
      setIsDownloadingSeparately(null);
    }
  };

  // Download all assets as ZIP using JSZip
  const handleDownloadZip = async (req: UploadRequest) => {
    if (!req.assets || req.assets.length === 0) return;

    setIsZipping(req.id);
    try {
      const zip = new JSZip();

      for (let i = 0; i < req.assets.length; i++) {
        const asset = req.assets[i];
        const ext = asset.format || (req.media_type === 'image' ? 'jpg' : 'mp4');
        const filename = formatDownloadFilename(req.customer_name, req.customer_phone, i, ext);

        const response = await fetch(asset.secure_url);
        const blob = await response.blob();
        zip.file(filename, blob);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const safeCustomer = req.customer_name.replace(/[^a-zA-Z0-9]/g, '_');
      const zipName = `${safeCustomer}_HD_Media.zip`;

      const downloadUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = zipName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      if (req.status === 'pending') {
        await handleStatusChange(req.id, 'downloaded');
      }
    } catch (err) {
      alert('Failed to generate ZIP file.');
      console.error(err);
    } finally {
      setIsZipping(null);
    }
  };

  // Compute time remaining until 24h expiration
  const getTimeRemaining = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${mins}m left`;
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6 space-y-6 animate-fade-in">
      {/* Top Banner & Settings Link */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-[#E4EAE5] dark:border-[#334539]">
        <div>
          <h1 className="text-xl font-extrabold text-[#19241E] dark:text-[#F2F6F2] flex items-center gap-2">
            <span>Admin Delivery Console</span>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#21A36B]/15 text-[#21A36B]">
              Active
            </span>
          </h1>
          <p className="text-xs text-[#748078] dark:text-[#A7B8AC] mt-0.5">
            Download customer HD media and manually dispatch to their WhatsApp chats.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onViewCustomerApp && (
            <button
              onClick={onViewCustomerApp}
              className="px-3 py-2 rounded-xl border border-[#CBD5CD] dark:border-[#3E5244] text-[#173B2A] dark:text-[#58C994] hover:bg-[#F1F5F1] dark:hover:bg-[#25332A] text-xs font-semibold transition-colors"
            >
              View Customer App
            </button>
          )}
          <button
            onClick={loadRequests}
            className="p-2 rounded-xl border border-[#E4EAE5] dark:border-[#334539] hover:bg-[#F1F5F1] dark:hover:bg-[#25332A] text-[#748078] dark:text-[#A7B8AC]"
            title="Refresh requests"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={onOpenSettings}
            className="px-3.5 py-2 rounded-xl bg-[#173B2A] dark:bg-[#58C994] text-white dark:text-[#101713] text-xs font-semibold hover:opacity-95 shadow-sm"
          >
            Settings
          </button>
        </div>
      </div>

      {/* Cloudinary Cleanup Failure Warning */}
      {failedCleanups.length > 0 && (
        <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold block">Cloudinary Media Cleanup Notice</span>
            <p className="leading-relaxed">
              {failedCleanups.length} temporary media {failedCleanups.length === 1 ? 'file has' : 'files have'} failed automatic 24-hour permanent deletion after 3+ attempts. Please verify your Cloudinary API credentials in Supabase Edge Functions.
            </p>
          </div>
        </div>
      )}

      {/* Admin Navigation Tabs */}
      <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-[#F1F5F1] dark:bg-[#1A241E] border border-[#E4EAE5] dark:border-[#334539] w-fit">
        <button
          onClick={() => setAdminTab('requests')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            adminTab === 'requests'
              ? 'bg-[#173B2A] dark:bg-[#58C994] text-white dark:text-[#101713] shadow-sm'
              : 'text-[#748078] dark:text-[#A7B8AC] hover:text-[#19241E] dark:hover:text-[#F2F6F2]'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Requests Queue</span>
          {newCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-white font-bold">
              {newCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setAdminTab('customers')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            adminTab === 'customers'
              ? 'bg-[#173B2A] dark:bg-[#58C994] text-white dark:text-[#101713] shadow-sm'
              : 'text-[#748078] dark:text-[#A7B8AC] hover:text-[#19241E] dark:hover:text-[#F2F6F2]'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Customers & Quotas</span>
        </button>
      </div>

      {adminTab === 'customers' ? (
        <CustomerManagement
          onSelectCustomerRequests={(query) => {
            setAdminTab('requests');
            setSearchQuery(query);
          }}
        />
      ) : (
        <>
          {/* Clean Stats Row (PART 13) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1A241E] border border-[#E4EAE5] dark:border-[#334539] shadow-sm">
          <span className="text-[11px] font-medium text-[#748078] dark:text-[#A7B8AC] block">New Requests</span>
          <p className="text-xl font-extrabold text-amber-600 dark:text-amber-400 mt-0.5">{newCount}</p>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1A241E] border border-[#E4EAE5] dark:border-[#334539] shadow-sm">
          <span className="text-[11px] font-medium text-[#748078] dark:text-[#A7B8AC] block">Pending</span>
          <p className="text-xl font-extrabold text-[#19241E] dark:text-[#F2F6F2] mt-0.5">{pendingCount}</p>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1A241E] border border-[#E4EAE5] dark:border-[#334539] shadow-sm">
          <span className="text-[11px] font-medium text-[#748078] dark:text-[#A7B8AC] block">Pictures Waiting</span>
          <p className="text-xl font-extrabold text-[#173B2A] dark:text-[#58C994] mt-0.5">{picturesWaiting}</p>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1A241E] border border-[#E4EAE5] dark:border-[#334539] shadow-sm">
          <span className="text-[11px] font-medium text-[#748078] dark:text-[#A7B8AC] block">Videos Waiting</span>
          <p className="text-xl font-extrabold text-[#21A36B] mt-0.5">{videosWaiting}</p>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1A241E] border border-[#E4EAE5] dark:border-[#334539] shadow-sm col-span-2 sm:col-span-1">
          <span className="text-[11px] font-medium text-[#748078] dark:text-[#A7B8AC] block">Sent Today</span>
          <p className="text-xl font-extrabold text-blue-600 dark:text-blue-400 mt-0.5">{sentTodayCount}</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#748078] dark:text-[#A7B8AC]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by customer name, email, phone, or request code..."
            className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-[#E4EAE5] dark:border-[#334539] bg-white dark:bg-[#1A241E] text-xs text-[#19241E] dark:text-[#F2F6F2] outline-none focus:ring-2 focus:ring-[#21A36B]/40"
          />
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[#F1F5F1] dark:bg-[#25332A] overflow-x-auto">
          {(['all', 'pending', 'downloaded', 'sent', 'expired'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilterStatus(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all shrink-0 ${
                filterStatus === tab
                  ? 'bg-white dark:bg-[#1A241E] text-[#19241E] dark:text-[#F2F6F2] font-semibold shadow-sm'
                  : 'text-[#748078] dark:text-[#A7B8AC] hover:text-[#19241E] dark:hover:text-[#F2F6F2]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Requests List */}
      <div className="space-y-3">
        {requests.length === 0 ? (
          <div className="text-center py-12 rounded-2xl border border-dashed border-[#E4EAE5] dark:border-[#334539] bg-white dark:bg-[#1A241E] p-6 text-xs font-semibold text-[#748078] dark:text-[#A7B8AC]">
            No requests yet
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="text-center py-12 rounded-2xl border border-dashed border-[#E4EAE5] dark:border-[#334539] bg-white dark:bg-[#1A241E] p-6 text-xs text-[#748078] dark:text-[#A7B8AC]">
            No customer requests matching the current filter.
          </div>
        ) : (
          filteredRequests.map((req) => {
            const waUrl = getWhatsAppUrl(
              req.customer_phone,
              `Hello ${req.customer_name}! Your HD Status media is ready. Please find the high-definition files attached below. Thank you for using Breezing Status HD!`
            );
            const isExpired = req.status === 'expired' || new Date(req.expires_at).getTime() <= Date.now();
            const hasMultiple = (req.assets?.length || 0) >= 2;

            return (
              <div
                key={req.id}
                className="p-4 rounded-2xl bg-white dark:bg-[#1A241E] border border-[#E4EAE5] dark:border-[#334539] shadow-sm hover:shadow transition-all space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono font-bold text-xs px-2 py-0.5 rounded-md bg-[#F1F5F1] dark:bg-[#25332A] text-[#173B2A] dark:text-[#58C994]">
                      {req.request_code}
                    </span>
                    <h3 className="font-bold text-sm text-[#19241E] dark:text-[#F2F6F2]">
                      {req.customer_name}
                    </h3>
                    <span className="text-[10px] text-[#748078] dark:text-[#A7B8AC]">
                      · {req.package_name} ({req.watermark_applied ? 'Watermarked' : 'No Watermark'})
                    </span>
                  </div>

                  {/* Status & Expiry countdown */}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-[11px] text-[#748078] dark:text-[#A7B8AC] flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-500" />
                      <span>{getTimeRemaining(req.expires_at)}</span>
                    </span>

                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                        req.status === 'sent'
                          ? 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400'
                          : req.status === 'downloaded'
                          ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400'
                          : isExpired
                          ? 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                          : 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      {req.status}
                    </span>
                  </div>
                </div>

                {/* Customer Contact & Meta */}
                <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-[#748078] dark:text-[#A7B8AC]">
                  <span>{req.customer_email}</span>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-[#19241E] dark:text-[#F2F6F2] font-semibold">
                      {req.customer_phone}
                    </span>
                    <button
                      onClick={() => handleCopyPhone(req.customer_phone)}
                      className="p-1 hover:text-[#19241E] dark:hover:text-[#F2F6F2]"
                      title="Copy phone number"
                    >
                      {copiedPhone === req.customer_phone ? (
                        <Check className="w-3 h-3 text-[#21A36B]" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                  <span>· {req.media_count} {req.media_type === 'image' ? 'Photos' : 'Videos'}</span>
                  <span>· Submitted {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>

                {/* Thumbnail Grid with Individual Download on each item (PART 8) */}
                {req.assets && req.assets.length > 0 && (
                  <div className="flex items-center gap-2.5 overflow-x-auto py-1">
                    {req.assets.map((asset, idx) => (
                      <div
                        key={asset.id}
                        className="relative group shrink-0 w-20 h-20 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-[#E4EAE5] dark:border-[#334539]"
                      >
                        <img
                          src={asset.secure_url}
                          alt="Asset"
                          className="w-full h-full object-cover"
                        />
                        {/* Overlay with Preview & Individual Download buttons */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1.5 transition-all">
                          <button
                            onClick={() => {
                              setSelectedPreviewReq(req);
                              setPreviewMediaIndex(idx);
                            }}
                            className="p-1 rounded-md bg-white/20 text-white hover:bg-white/40"
                            title="Preview"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDownloadAsset(req, idx)}
                            className="p-1 rounded-md bg-[#21A36B] text-white hover:bg-[#1b8858]"
                            title="Download single file"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Action Buttons (PART 8) */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E4EAE5] dark:border-[#334539]">
                  {/* Left: WhatsApp & Download Options */}
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#21A36B] hover:bg-[#1b8858] text-white text-xs font-semibold shadow-sm transition-all"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>Open WhatsApp</span>
                      <ExternalLink className="w-3 h-3 ml-0.5 opacity-80" />
                    </a>

                    {hasMultiple ? (
                      <>
                        <button
                          onClick={() => handleDownloadAllSeparately(req)}
                          disabled={isDownloadingSeparately === req.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E4EAE5] dark:border-[#334539] bg-white dark:bg-[#101713] hover:bg-[#F1F5F1] dark:hover:bg-[#25332A] text-xs font-semibold text-[#19241E] dark:text-[#F2F6F2] transition-all"
                          title="Download all photographs as individual JPEGs"
                        >
                          <Layers className="w-3.5 h-3.5 text-[#173B2A] dark:text-[#58C994]" />
                          <span>
                            {isDownloadingSeparately === req.id ? 'Downloading...' : 'Download All Separately'}
                          </span>
                        </button>

                        <button
                          onClick={() => handleDownloadZip(req)}
                          disabled={isZipping === req.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E4EAE5] dark:border-[#334539] bg-white dark:bg-[#101713] hover:bg-[#F1F5F1] dark:hover:bg-[#25332A] text-xs font-semibold text-[#19241E] dark:text-[#F2F6F2] transition-all"
                        >
                          <Archive className="w-3.5 h-3.5 text-[#173B2A] dark:text-[#58C994]" />
                          <span>{isZipping === req.id ? 'Zipping...' : 'Download ZIP'}</span>
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleDownloadAsset(req, 0)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E4EAE5] dark:border-[#334539] bg-white dark:bg-[#101713] hover:bg-[#F1F5F1] dark:hover:bg-[#25332A] text-xs font-semibold text-[#19241E] dark:text-[#F2F6F2] transition-all"
                      >
                        <Download className="w-3.5 h-3.5 text-[#173B2A] dark:text-[#58C994]" />
                        <span>Download JPEG</span>
                      </button>
                    )}
                  </div>

                  {/* Right: Confirmation for Mark as Sent and Delete */}
                  <div className="flex items-center gap-2">
                    {req.status !== 'sent' && (
                      confirmSendId === req.id ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-[#748078] dark:text-[#A7B8AC]">Delivered?</span>
                          <button
                            onClick={() => handleConfirmSent(req.id)}
                            className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
                          >
                            Yes, Mark Sent
                          </button>
                          <button
                            onClick={() => setConfirmSendId(null)}
                            className="px-2 py-1 rounded-lg border border-[#E4EAE5] dark:border-[#334539] text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmSendId(req.id)}
                          className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all"
                        >
                          Mark as Sent
                        </button>
                      )
                    )}

                    <button
                      onClick={() => handleDelete(req.id)}
                      className="p-1.5 rounded-lg text-[#748078] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                      title="Delete request"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      </>
      )}

      {/* Lightbox / Asset Preview Modal with Next/Prev Swiping */}
      {selectedPreviewReq && selectedPreviewReq.assets && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in">
          <div className="relative max-w-2xl w-full bg-white dark:bg-[#1A241E] rounded-2xl overflow-hidden shadow-2xl border border-white/10">
            <div className="flex items-center justify-between p-4 border-b border-[#E4EAE5] dark:border-[#334539]">
              <div>
                <h3 className="text-sm font-bold text-[#19241E] dark:text-[#F2F6F2]">
                  {selectedPreviewReq.customer_name}
                </h3>
                <p className="text-[11px] text-[#748078] dark:text-[#A7B8AC]">
                  Asset {previewMediaIndex + 1} of {selectedPreviewReq.assets.length}
                </p>
              </div>

              <button
                onClick={() => setSelectedPreviewReq(null)}
                className="p-1 rounded-lg text-[#748078] hover:bg-[#F1F5F1] dark:hover:bg-[#25332A]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Media display with Prev/Next buttons */}
            <div className="relative aspect-[9/16] sm:aspect-video max-h-[60vh] bg-black flex items-center justify-center overflow-hidden">
              <img
                src={selectedPreviewReq.assets[previewMediaIndex]?.secure_url}
                alt="HD Asset"
                className="max-h-full max-w-full object-contain"
              />

              {selectedPreviewReq.assets.length > 1 && (
                <>
                  <button
                    onClick={() =>
                      setPreviewMediaIndex((prev) =>
                        prev > 0 ? prev - 1 : selectedPreviewReq.assets!.length - 1
                      )
                    }
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 text-white hover:bg-black/80"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() =>
                      setPreviewMediaIndex((prev) =>
                        prev < selectedPreviewReq.assets!.length - 1 ? prev + 1 : 0
                      )
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 text-white hover:bg-black/80"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>

            {/* Lightbox footer */}
            <div className="p-4 flex items-center justify-between bg-[#F8F9F7] dark:bg-[#101713]">
              <div className="flex gap-1.5 overflow-x-auto">
                {selectedPreviewReq.assets.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setPreviewMediaIndex(i)}
                    className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                      previewMediaIndex === i
                        ? 'bg-[#173B2A] dark:bg-[#58C994] text-white dark:text-[#101713]'
                        : 'bg-white dark:bg-[#1A241E] border border-[#E4EAE5] dark:border-[#334539]'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>

              <button
                onClick={() => handleDownloadAsset(selectedPreviewReq, previewMediaIndex)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#21A36B] hover:bg-[#1b8858] text-white text-xs font-semibold shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Photo</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
