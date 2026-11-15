import { useEffect, useState, type AnchorHTMLAttributes } from "react";

export type Route =
  | { name: "app" }
  | { name: "publicNote"; noteId: string }
  | { name: "publicNotebook"; notebookId: string; noteId?: string };

export function matchRoute(pathname: string): Route {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "share" && parts[1] === "note" && parts[2]) {
    return { name: "publicNote", noteId: parts[2] };
  }
  if (parts[0] === "share" && parts[1] === "notebook" && parts[2]) {
    return { name: "publicNotebook", notebookId: parts[2], noteId: parts[3] };
  }
  return { name: "app" };
}

export function useRoute(): Route {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return matchRoute(path);
}

export function navigate(to: string) {
  history.pushState(null, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}

export function Link({ to, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      href={to}
      {...rest}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
    />
  );
}
