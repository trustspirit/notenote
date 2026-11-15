import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { Cloud, CloudAlert, CloudOff, RefreshCw } from "lucide-react";
import { useState, type ReactElement } from "react";
import type { BackupState, useDriveBackup } from "../hooks/useDriveBackup";
import { driveFolderUrl } from "../lib/backup/driveClient";
import { formatRelative } from "../lib/format";

type Backup = ReturnType<typeof useDriveBackup>;

function summary(s: BackupState): { label: string; icon: ReactElement } {
  switch (s.kind) {
    case "off": return { label: "Drive 백업", icon: <Cloud size={16} aria-hidden /> };
    case "reconnect": return { label: "Drive 다시 연결", icon: <CloudOff size={16} aria-hidden /> };
    case "syncing": return { label: "백업 중…", icon: <RefreshCw size={16} aria-hidden className="spin" /> };
    case "synced": return { label: "백업됨", icon: <Cloud size={16} aria-hidden /> };
    case "error": return { label: "백업 오류", icon: <CloudAlert size={16} aria-hidden /> };
    default: return { label: "", icon: <Cloud size={16} aria-hidden /> };
  }
}

/** Top-bar entry point + details dialog for the Google Drive backup. */
export function DriveBackupButton({ backup, isCompact }: { backup: Backup; isCompact?: boolean }) {
  const [open, setOpen] = useState(false);
  const { state, saved } = backup;
  if (state.kind === "unavailable") return null;
  const { label, icon } = summary(state);
  const connected = state.kind === "synced" || state.kind === "syncing" || (state.kind === "error" && !!saved);

  return (
    <>
      {isCompact
        ? <IconButton label={label} tooltip={label} size="sm" variant="ghost" icon={icon} onClick={() => setOpen(true)} />
        : <Button label={label} icon={icon} size="sm" variant="ghost" onClick={() => setOpen(true)} />}

      {open && (
        <Dialog isOpen purpose="info" width={460} onOpenChange={setOpen}>
          <DialogHeader title="Google Drive 백업" onOpenChange={setOpen} />
          <VStack gap={4} padding={4}>
            <VStack gap={2}>
              <Text>
                노트를 내 Google Drive의 <b>Pensieve</b> 폴더에 Markdown(.md) 파일로 자동 백업해요.
                노트북은 폴더, 노트는 파일 하나가 됩니다.
              </Text>
              <Text type="supporting">
                편집을 멈추고 몇 초 뒤 바뀐 노트만 올립니다. 삭제한 노트는 Drive 휴지통으로 옮겨져 30일 동안 되살릴 수 있어요.
                Pensieve는 자신이 만든 파일 외에는 Drive에 접근하지 않아요.
              </Text>
            </VStack>

            {state.kind === "synced" && <Text type="supporting">마지막 백업: {formatRelative(state.at)}</Text>}
            {state.kind === "reconnect" && (
              <Banner status="info" title="다시 연결이 필요해요" description="보안을 위해 Drive 연결은 1시간마다 다시 확인해요. 버튼 한 번이면 됩니다." />
            )}
            {state.kind === "error" && <Banner status="error" title="백업하지 못했어요" description={state.message} />}

            <HStack gap={2} wrap="wrap" justify="end">
              {saved?.rootFolderId && (
                <Button label="Drive에서 열기" variant="ghost" href={driveFolderUrl(saved.rootFolderId)} target="_blank" rel="noreferrer" />
              )}
              {saved && <Button label="연결 해제" variant="ghost" onClick={() => { backup.disconnect(); setOpen(false); }} />}
              {state.kind === "off" || (state.kind === "error" && !saved) ? (
                <Button label="Google Drive 연결" variant="primary" onClick={() => void backup.connect()} />
              ) : state.kind === "reconnect" ? (
                <Button label="다시 연결" variant="primary" onClick={() => void backup.connect()} />
              ) : (
                <Button label="지금 백업" variant="primary" isLoading={state.kind === "syncing"} isDisabled={!connected} onClick={() => void backup.backupNow()} />
              )}
            </HStack>
          </VStack>
        </Dialog>
      )}
    </>
  );
}
