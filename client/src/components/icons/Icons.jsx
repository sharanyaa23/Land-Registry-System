/**
 * Icon re-exports from lucide-react.
 * All components in the app import from this file using our custom names.
 * Switching from hand-coded SVGs to lucide-react for consistency and quality.
 */
import {
  Blocks,
  TrendingUp,
  Wallet,
  ArrowLeftRight,
  FileText,
  ShieldCheck,
  ClipboardList,
  Upload,
  Check,
  AlertTriangle,
  Map,
  Search,
  User,
  LogOut,
  ChevronRight,
  Layers,
  Bell,
  Lock,
  MapPin,
  ExternalLink,
  Download,
} from 'lucide-react';

// Re-export with the names the app already uses — zero breaking changes
export const IconBlockchain    = Blocks;
export const IconLand          = TrendingUp;
export const IconWallet        = Wallet;
export const IconTransfer      = ArrowLeftRight;
export const IconDocument      = FileText;
export const IconShield        = ShieldCheck;
export const IconCases         = ClipboardList;
export const IconUpload        = Upload;
export const IconCheck         = Check;
export const IconAlert         = AlertTriangle;
export const IconMap           = Map;
export const IconSearch        = Search;
export const IconUser          = User;
export const IconLogout        = LogOut;
export const IconChevron       = ChevronRight;
export const IconPolygon       = Layers;
export const IconNotification  = Bell;
export const IconEscrow        = Lock;
export const IconMapPin        = MapPin;
export const IconExternalLink  = ExternalLink;
export const IconDownload      = Download;