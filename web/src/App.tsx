import { lazy, Suspense } from "react";
import { useAuth } from "./hooks/useAuth";
import { useRoute } from "./router";

// Split bundles: visitors of shared links never download the editor (TipTap).
const Workspace = lazy(() => import("./components/Workspace").then((m) => ({ default: m.Workspace })));
const PublicNotePage = lazy(() => import("./components/PublicPages").then((m) => ({ default: m.PublicNotePage })));
const PublicNotebookPage = lazy(() => import("./components/PublicPages").then((m) => ({ default: m.PublicNotebookPage })));

const Loading = () => <div className="center-screen">불러오는 중…</div>;

function PrivateApp() {
  const { user, loading, signIn, signOut } = useAuth();
  if (loading) return <Loading />;
  if (!user) {
    return (
      <div className="login">
        <p className="brand big"><span className="brand-mark">¶</span> Marginalia</p>
        <p className="login-lede">대충 적고, 버튼 하나로 정리하세요.</p>
        <button type="button" className="primary" onClick={() => void signIn()}>Google로 시작하기</button>
      </div>
    );
  }
  return <Workspace user={user} onSignOut={() => void signOut()} />;
}

export default function App() {
  const route = useRoute();
  return (
    <Suspense fallback={<Loading />}>
      {route.name === "publicNote" ? (
        <PublicNotePage noteId={route.noteId} />
      ) : route.name === "publicNotebook" ? (
        <PublicNotebookPage notebookId={route.notebookId} noteId={route.noteId} />
      ) : (
        <PrivateApp />
      )}
    </Suspense>
  );
}
