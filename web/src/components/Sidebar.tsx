import { Badge } from "@astryxdesign/core/Badge";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import type { Note, Notebook } from "../lib/types";

export type Filter = { kind: "all" } | { kind: "notebook"; id: string } | { kind: "tag"; tag: string };

interface Props {
  notebooks: Notebook[];
  notes: Note[];
  filter: Filter;
  onFilter: (f: Filter) => void;
  onCreateNotebook: () => void;
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

  return (
    <SideNav>
      <SideNavSection title="노트" isHeaderHidden>
        <SideNavItem
          label="모든 노트"
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

      {tagCounts.size > 0 && (
        <SideNavSection title="태그">
          <HStack gap={1} wrap="wrap" paddingInline={2}>
            {[...tagCounts.entries()].sort((a, b) => b[1] - a[1]).map(([tag, c]) => (
              <Token
                key={tag}
                size="sm"
                label={`#${tag} ${c}`}
                color={f.kind === "tag" && f.tag === tag ? "blue" : "default"}
                onClick={() => p.onFilter({ kind: "tag", tag })}
              />
            ))}
          </HStack>
        </SideNavSection>
      )}
    </SideNav>
  );
}
