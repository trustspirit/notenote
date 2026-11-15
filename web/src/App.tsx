import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { lazy, Suspense } from "react";
import { Loading } from "./components/Loading";
import { useAuth } from "./hooks/useAuth";
import { useRoute } from "./router";

// Split bundles: visitors of shared links never download the editor (TipTap).
const Workspace = lazy(() => import("./components/Workspace").then((m) => ({ default: m.Workspace })));
const PublicNotePage = lazy(() => import("./components/PublicPages").then((m) => ({ default: m.PublicNotePage })));
const PublicNotebookPage = lazy(() => import("./components/PublicPages").then((m) => ({ default: m.PublicNotebookPage })));

function PrivateApp() {
  const { user, loading, signIn, signOut } = useAuth();
  if (loading) return <Loading />;
  if (!user) {
    return (
      <div className="login">
        <Card>
          <VStack gap={4} padding={6} hAlign="start">
            <Heading level={1}>Pensieve</Heading>
            <Text type="large" color="secondary">머릿속 생각을 꺼내 담고, 버튼 하나로 정리하세요.</Text>
            <Button label="Google로 시작하기" variant="primary" size="lg" width="100%" onClick={() => void signIn()} />
          </VStack>
        </Card>
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
