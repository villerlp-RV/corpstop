import { toast } from "sonner";

// One call for success and error toasts, so pages don't each import sonner.
export function notify(text, tone = "info") {
  if (tone === "error") toast.error(text);
  else toast(text);
}
