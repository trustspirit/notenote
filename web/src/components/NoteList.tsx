import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import type { ReactNode } from "react";
import { formatDate } from "../lib/format";
import { excerpt } from "../lib/sanitize";
import type { Note } from "../lib/types";

interface Props {
  heading: string;
  notes: Note[];
  selectedId: string | null;
  search: string;
  onSearch: (q: string) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  /** Notebook share/rename/delete controls when a notebook is selected. */
  headerExtra?: ReactNode;
}

export function NoteList(p: Props) {
  return (
    <VStack gap={3} className="note-list">
      <HStack gap={2} vAlign="center" justify="between">
        <Heading level={2} maxLines={1}>{p.heading}</Heading>
        <Button label="새 노트" icon={<span className="glyph">＋</span>} variant="primary" size="sm" onClick={p.onCreate} />
      </HStack>
      {p.headerExtra}
      <TextInput
        label="노트 검색"
        isLabelHidden
        startIcon="search"
        placeholder="노트 검색"
        value={p.search}
        onChange={p.onSearch}
        hasClear
      />
      <Text type="supporting">{p.notes.length}개의 노트</Text>

      {p.notes.length === 0 ? (
        <EmptyState isCompact title="노트가 없어요" description="새 노트를 만들어 생각을 적어보세요." />
      ) : (
        <ul className="note-items" role="list">
          {p.notes.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className="note-item"
                aria-current={p.selectedId === n.id}
                onClick={() => p.onSelect(n.id)}
              >
                <HStack gap={1} vAlign="center">
                  <Text weight="semibold" maxLines={1}>{n.title || "제목 없음"}</Text>
                  {n.isPublic && <Badge variant="blue" label="공개" />}
                  {n.aiOrganizedAt && <Badge variant="purple" label="✦ AI" />}
                </HStack>
                <Text type="supporting" maxLines={2}>{excerpt(n.contentHtml) || "내용 없음"}</Text>
                <Text type="supporting" size="2xs">{formatDate(n.updatedAt)}</Text>
              </button>
            </li>
          ))}
        </ul>
      )}
    </VStack>
  );
}
