import React from 'react';

const STATUS_STYLES = {
  // Verification statuses
  verified:              { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', label: 'Verified' },
  verification_passed:   { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', label: 'Verified' },
  verification_pending:  { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/20',   label: 'Verifying' },
  verification_failed:   { bg: 'bg-red-500/10',     text: 'text-red-400',     border: 'border-red-500/20',     label: 'Failed' },

  // Land statuses
  registered:            { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', label: 'Registered' },
  listed:                { bg: 'bg-blue-500/10',    text: 'text-blue-400',    border: 'border-blue-500/20',    label: 'Listed' },
  transferred:           { bg: 'bg-violet-500/10',  text: 'text-violet-400',  border: 'border-violet-500/20',  label: 'Transferred' },
  draft:                 { bg: 'bg-zinc-500/10',    text: 'text-zinc-400',    border: 'border-zinc-500/20',    label: 'Draft' },

  // Transfer statuses
  offer_sent:            { bg: 'bg-sky-500/10',     text: 'text-sky-400',     border: 'border-sky-500/20',     label: 'Offer Sent' },
  transfer_pending:      { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/20',   label: 'Transfer Pending' },
  coowner_consent_pending:{ bg: 'bg-amber-500/10',  text: 'text-amber-400',   border: 'border-amber-500/20',   label: 'Awaiting Co-owners' },
  escrow_locked:         { bg: 'bg-indigo-500/10',  text: 'text-indigo-400',  border: 'border-indigo-500/20',  label: 'Escrow Locked' },
  approved:              { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', label: 'Approved' },
  completed:             { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', label: 'Completed' },
  rejected:              { bg: 'bg-red-500/10',     text: 'text-red-400',     border: 'border-red-500/20',     label: 'Rejected' },
  cancelled:             { bg: 'bg-zinc-500/10',    text: 'text-zinc-400',    border: 'border-zinc-500/20',    label: 'Cancelled' },

  // Officer / review
  officer_review:        { bg: 'bg-orange-500/10',  text: 'text-orange-400',  border: 'border-orange-500/20',  label: 'Officer Review' },
  pending:               { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/20',   label: 'Pending' },
  in_review:             { bg: 'bg-sky-500/10',     text: 'text-sky-400',     border: 'border-sky-500/20',     label: 'In Review' },
  under_review:          { bg: 'bg-sky-500/10',     text: 'text-sky-400',     border: 'border-sky-500/20',     label: 'Under Review' },
  flagged:               { bg: 'bg-red-500/10',     text: 'text-red-400',     border: 'border-red-500/20',     label: 'Flagged' },
};

const DEFAULT_STYLE = { bg: 'bg-zinc-500/10', text: 'text-zinc-400', border: 'border-zinc-500/20' };

const StatusBadge = ({ status, customLabel }) => {
  const style = STATUS_STYLES[status] || DEFAULT_STYLE;
  const label = customLabel || style.label || status || 'Unknown';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${style.bg} ${style.text} ${style.border}`}>
      {label}
    </span>
  );
};

export default StatusBadge;
