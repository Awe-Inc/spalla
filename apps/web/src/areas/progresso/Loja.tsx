import { useState } from "react";

import type { UserStats } from "@/data/db";
import { canBuy, SHOP_ITEMS, type ShopItem } from "@/data/gamification";
import { buyItem } from "@/data/progress";
import { Button, Card } from "@/design/components";

function ownedLabel(item: ShopItem, stats: UserStats): string | null {
  if (item.kind === "freezer") return stats.freezers > 0 ? `${stats.freezers} guardado${stats.freezers === 1 ? "" : "s"}` : null;
  return stats.unlockedItems.includes(item.id) ? "Já é seu" : null;
}

export function Loja({ stats }: { stats: UserStats }) {
  const [message, setMessage] = useState<string | null>(null);

  async function buy(item: ShopItem) {
    const bought = await buyItem(item.id, item.priceResinas);
    setMessage(bought ? `${item.name}: comprado.` : "Não deu: faltam resinas ou o item já é seu.");
  }

  return (
    <Card title="Loja" className="grid gap-3">
      <p className="text-ink-muted">
        Você tem <span className="font-mono tabular">{stats.resinas}</span> resinas. Cada estrela vale 5.
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {SHOP_ITEMS.map((item) => {
          const owned = ownedLabel(item, stats);
          return (
            <li key={item.id} className="grid gap-2 rounded-md bg-surface-soft p-3">
              <div className="grid gap-0.5">
                <span className="font-semibold">{item.name}</span>
                <span className="text-caption text-ink-subtle">{item.description}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-caption text-ink-subtle">{owned ?? `${item.priceResinas} resinas`}</span>
                <Button className="h-9 md:h-9" disabled={!canBuy(stats, item)} onClick={() => void buy(item)}>
                  {item.kind === "freezer" && stats.freezers > 0 ? "Mais um" : "Comprar"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {message ? (
        <p className="text-caption text-ink-muted" role="status">
          {message}
        </p>
      ) : null}
    </Card>
  );
}
