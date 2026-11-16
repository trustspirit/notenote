import { Badge } from "@astryxdesign/core/Badge";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { BookText, Files } from "lucide-react";
import { useState } from "react";
import type { Note, Notebook } from "../lib/types";

export type Filter = { kind: "all" } | { kind: "notebook"; id: string } | { kind: "tag"; tag: string };

interface Props {
  notebooks: Notebook[];
  notes: Note[];
  filter: Filter;
  onFilter: (f: Filter) => void;
  onCreateNotebook: () => void;
}

const COLLAPSE_KEY = "pensieve.sidebarCollapsed";
// Per-viewer convenience only; storage may be unavailable (private mode), so never throw.
function readCollapsed(): boolean {
  try { return localStorage.getItem(COLLAPSE_KEY) === "1"; } catch { return false; }
}
function writeCollapsed(v: boolean) {
  try { localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0"); } catch { /* ignore */ }
}

function Count({ n }: { n: number }) {
  return <Text type="supporting" hasTabularNumbers>{n}</Text>;
}

export function Sidebar(p: Props) {
  const counts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  for (const n of p.notes) {
    counts.set(n.notebookId, (counts.get(n.notebookId) ?? 0) + 1);
    for (const t of n.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }
  const f = p.filter;
  const [isCollapsed, setCollapsed] = useState(readCollapsed);

  return (
    <SideNav
      collapsible={{
        isCollapsed,
        onCollapsedChange: (next) => { setCollapsed(next); writeCollapsed(next); },
      }}
    >
      <SideNavSection title="노트" isHeaderHidden>
        <SideNavItem
          label="모든 노트"
          icon={Files}
          isSelected={f.kind === "all"}
          onClick={() => p.onFilter({ kind: "all" })}
          endContent={<Count n={p.notes.length} />}
        />
      </SideNavSection>

      <SideNavSection
        title="노트북"
        endContent={<IconButton label="새 노트북" tooltip="새 노트북" icon={<span className="glyph">＋</span>} size="sm" variant="ghost" onClick={p.onCreateNotebook} />}
      >
        {p.notebooks.map((nb) => (
          <SideNavItem
            key={nb.id}
            label={nb.name}
            icon={BookText}
            isSelected={f.kind === "notebook" && f.id === nb.id}
            onClick={() => p.onFilter({ kind: "notebook", id: nb.id })}
            endContent={
              <HStack gap={1} vAlign="center">
                {nb.isPublic && <Badge variant="blue" label="공개" />}
                <Count n={counts.get(nb.id) ?? 0} />
              </HStack>
            }
          />
        ))}
      </SideNavSection>

      {tagCounts.size > 0 && !isCollapsed && (
        <SideNavSection title="태그">
          <HStack gap={1} wrap="wrap" paddingInline={2}>
            {[...tagCounts.entries()].sort((a, b) => b[1] - a[1]).map(([tag, c]) => (
              <Token
                key={tag}
                size="sm"
                label={`#${tag} ${c}`}
                color={f.kind === "tag" && f.tag === tag ? "blue" : "default"}
                // Tapping the active tag again clears the filter.
                onClick={() => p.onFilter(f.kind === "tag" && f.tag === tag ? { kind: "all" } : { kind: "tag", tag })}
              />
            ))}
          </HStack>
        </SideNavSection>
      )}
    </SideNav>
  );
}
