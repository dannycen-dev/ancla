import { useEffect, useMemo, useState } from "react";
import {
  coverProducts,
  coveredItemIds,
  formatDays,
  formatMoney,
  formatRunOut,
  periodSpend,
  type ProductCoverage,
} from "../shared/catalog.ts";
import {
  CATEGORY_ORDER,
  buildGrocery,
  categoryLabel,
  formatQty,
  type GroceryCategory,
  type GroceryItem,
} from "../shared/grocery.ts";
import { formatDayLong } from "../shared/schedule.ts";
import { dateInPeriod, payPeriodFor, periodTitle, shiftPeriod, type PayPeriod } from "../shared/period.ts";
import { CONSULT_EXPENSE_ID, type Plan } from "../shared/plan.ts";
import { loadPantry, savePantry } from "./api.ts";

type PantryProps = {
  plan: Plan;
  todayIso: string;
};

export function Pantry({ plan, todayIso }: PantryProps) {
  const [period, setPeriod] = useState<PayPeriod>(() => payPeriodFor(todayIso));
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const list = useMemo(() => buildGrocery(plan, period), [plan, period]);
  const coverages = useMemo(
    () => coverProducts(list, plan.products, period, plan),
    [list, plan.products, period, plan],
  );
  const hiddenIds = useMemo(() => coveredItemIds(list, plan.products), [list, plan.products]);
  const current = payPeriodFor(todayIso);
  const isCurrent = period.id === current.id;
  const consultHere = dateInPeriod(period, plan.consultOn);
  const consultPaid = checkedIds.includes(CONSULT_EXPENSE_ID);
  const spend =
    periodSpend(coverages, checkedIds) +
    (consultHere && !consultPaid && plan.consultFeeMxn > 0 ? plan.consultFeeMxn : 0);

  useEffect(() => {
    let cancelled = false;
    void loadPantry(period.id).then((state) => {
      if (!cancelled) setCheckedIds(state.checkedIds);
    });
    return () => {
      cancelled = true;
    };
  }, [period.id]);

  function patchChecked(next: string[]) {
    setCheckedIds(next);
    void savePantry({ periodId: period.id, checkedIds: next });
  }

  function toggle(id: string) {
    patchChecked(checkedIds.includes(id) ? checkedIds.filter((item) => item !== id) : [...checkedIds, id]);
  }

  const visibleItems = list.items.filter((item) => !hiddenIds.has(item.id));
  const grouped = CATEGORY_ORDER.map((category) => ({
    category,
    items: visibleItems.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0);

  const buyable = [
    ...coverages.map((item) => item.product.id),
    ...(consultHere ? [CONSULT_EXPENSE_ID] : []),
    ...visibleItems.map((item) => item.id),
    ...list.choices.map((item) => item.id),
  ];
  const bought = buyable.filter((id) => checkedIds.includes(id)).length;

  return (
    <section className="progress">
      <p className="eyebrow">{isCurrent ? "Esta quincena" : "Otra quincena"}</p>
      <h1>Despensa</h1>
      <p className="lede">
        Compra para {list.days} días: {periodTitle(period)}. Si ya me pasaste marca, tamaño y precio, aquí
        sale cuánto comprar y cuándo se acaba. El resto se queda con el nombre del menú.
      </p>

      <nav className="period-nav" aria-label="Quincena">
        <button type="button" className="ghost" onClick={() => setPeriod(shiftPeriod(period, -1))}>
          Anterior
        </button>
        <button
          type="button"
          className={isCurrent ? "ghost is-quiet" : "ghost"}
          onClick={() => setPeriod(current)}
          disabled={isCurrent}
        >
          {isCurrent ? "Actual" : "Ir a la actual"}
        </button>
        <button type="button" className="ghost" onClick={() => setPeriod(shiftPeriod(period, 1))}>
          Siguiente
        </button>
      </nav>

      <div className="stat-grid">
        <article className="stat">
          <strong>{list.days}</strong>
          <span>Días a cubrir</span>
        </article>
        <article className="stat">
          <strong>
            {bought}/{buyable.length}
          </strong>
          <span>Ya tengo</span>
        </article>
        <article className="stat">
          <strong>{spend > 0 ? formatMoney(spend) : "—"}</strong>
          <span>Gasto con precio</span>
        </article>
      </div>

      <p className="meta">
        {period.payLabel} ({formatDayLong(period.payday)}) → compra del {formatDayLong(period.start)} al{" "}
        {formatDayLong(period.end)}. El gasto solo suma lo que aún no marcas y de lo que ya hay precio.
      </p>

      {consultHere ? (
        <article className={`product-card ${consultPaid ? "is-complete" : ""}`}>
          <div className="habit-head">
            <h3>Consulta con el nutriólogo</h3>
            <strong>{formatMoney(plan.consultFeeMxn)}</strong>
          </div>
          <p>
            El {formatDayLong(plan.consultOn)}. {payPeriodFor(plan.consultOn).payLabel} (
            {formatDayLong(payPeriodFor(plan.consultOn).payday)}).
          </p>
          <p className="product-buy">Aparta {formatMoney(plan.consultFeeMxn)} de esta quincena</p>
          <button
            type="button"
            className={`check-line ${consultPaid ? "is-on" : ""}`}
            onClick={() => toggle(CONSULT_EXPENSE_ID)}
          >
            {consultPaid ? "Ya está pagada" : "Marcar como pagada"}
          </button>
        </article>
      ) : plan.consultOn > period.end ? (
        <p className="banner">
          La consulta del {formatDayLong(plan.consultOn)} cuesta {formatMoney(plan.consultFeeMxn)} y cae en
          la quincena del {periodTitle(payPeriodFor(plan.consultOn))}.
        </p>
      ) : null}

      {coverages.length > 0 ? (
        <section className="panel">
          <h2>Con precio y duración</h2>
          <RestockHint coverages={coverages} />
          {coverages.map((coverage) => (
            <ProductCard
              key={coverage.product.id}
              coverage={coverage}
              checked={checkedIds.includes(coverage.product.id)}
              onToggle={() => toggle(coverage.product.id)}
            />
          ))}
        </section>
      ) : null}

      <section className="habit">
        <div className="habit-head">
          <h2>Platillos de esta quincena</h2>
        </div>
        <ul className="meal-counts">
          {list.meals.map((meal) => (
            <li key={meal.optionId}>
              <span>
                {meal.meal}: {meal.option}
              </span>
              <strong>× {meal.times}</strong>
            </li>
          ))}
        </ul>
      </section>

      {list.choices.length > 0 ? (
        <section className="panel">
          <h2>Elige en el súper</h2>
          <p className="meta">
            Estas líneas del menú tienen “o”. No hace falta comprar las dos: elige una cada vez.
          </p>
          <ul className="grocery">
            {list.choices.map((choice) => (
              <li key={choice.id}>
                <button
                  type="button"
                  className={`grocery-line ${checkedIds.includes(choice.id) ? "is-on" : ""}`}
                  onClick={() => toggle(choice.id)}
                >
                  <span>
                    <strong>
                      {choice.title} · {choice.times} veces
                    </strong>
                    <em>{choice.options.join(" · o · ")}</em>
                  </span>
                  <b>{checkedIds.includes(choice.id) ? "Listo" : "Pendiente"}</b>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {grouped.map((group) => (
        <CategoryBlock
          key={group.category}
          category={group.category}
          items={group.items}
          checkedIds={checkedIds}
          onToggle={toggle}
        />
      ))}
    </section>
  );
}

function RestockHint({ coverages }: { coverages: ProductCoverage[] }) {
  const protein = coverages.find((item) => item.product.id === "proteina");
  const creatine = coverages.find((item) => item.product.id === "creatina");
  if (
    !protein?.runOutOnePack ||
    !creatine?.runOutOnePack ||
    protein.runOutOnePack >= creatine.runOutOnePack
  ) {
    return (
      <p className="meta">
        Márcalo si ya lo tienes en casa. El gasto de la quincena solo suma lo que sí hay que reponer.
      </p>
    );
  }
  return (
    <p className="meta">
      La proteína se acaba primero (aprox. el {formatRunOut(protein.runOutOnePack)}). La creatina sigue
      hasta el {formatRunOut(creatine.runOutOnePack)}, así que en septiembre repones proteína
      {protein.product.priceMxn != null ? ` a ${formatMoney(protein.product.priceMxn)}` : ""} y la
      creatina después
      {creatine.product.priceMxn != null ? ` a ${formatMoney(creatine.product.priceMxn)}` : ""}.
    </p>
  );
}

function ProductCard({
  coverage,
  checked,
  onToggle,
}: {
  coverage: ProductCoverage;
  checked: boolean;
  onToggle: () => void;
}) {
  const { product } = coverage;
  const title = [product.brand, product.name].filter(Boolean).join(" · ");
  const priceLabel =
    product.priceMxn != null ? `Recarga ${formatMoney(product.priceMxn)}` : "Sin precio de recarga";
  const buyLabel = (() => {
    if (coverage.packs <= 0 && product.openedOn) {
      return product.priceMxn != null
        ? `Este empaque te alcanza esta quincena · próxima recarga ${formatMoney(product.priceMxn)}`
        : "Este empaque te alcanza esta quincena";
    }
    if (coverage.packs <= 0) return "No hace falta comprar";
    if (coverage.periodCost != null) {
      return `Compra ${coverage.packs === 1 ? "1 empaque" : `${coverage.packs} empaques`} · ${formatMoney(coverage.periodCost)}`;
    }
    return coverage.packs === 1 ? "1 empaque cubre esta quincena" : `${coverage.packs} empaques`;
  })();

  return (
    <article className={`product-card ${checked ? "is-complete" : ""}`}>
      <div className="habit-head">
        <h3>{title}</h3>
        <strong>{priceLabel}</strong>
      </div>
      <p>
        {product.packLabel}
        {product.store ? ` · ${product.store}` : ""}
        {product.servings
          ? ` · ${product.servingQty} ${product.servingUnit} por porción · ${product.servings} porciones`
          : ""}
      </p>
      <p className="meta">{coverage.needLabel}</p>
      <p>
        {coverage.daysOnePack != null && coverage.runOutOnePack
          ? `1 empaque te dura ~${formatDays(coverage.daysOnePack)} · se acaba aprox. el ${formatRunOut(coverage.runOutOnePack)}`
          : coverage.dailyLabel}
      </p>
      {coverage.packs > 1 && coverage.runOutBought ? (
        <p>
          Con {coverage.packs} empaques alcanzas hasta el {formatRunOut(coverage.runOutBought)}
          {coverage.leftover > 0 ? " · sobra un poco para la siguiente quincena" : ""}.
        </p>
      ) : null}
      {product.note ? <p className="meta">{product.note}</p> : null}
      <p className="product-buy">{buyLabel}</p>
      <button type="button" className={`check-line ${checked ? "is-on" : ""}`} onClick={onToggle}>
        {checked ? "Ya lo tengo" : "Marcar que ya lo tengo"}
      </button>
    </article>
  );
}

function CategoryBlock({
  category,
  items,
  checkedIds,
  onToggle,
}: {
  category: GroceryCategory;
  items: GroceryItem[];
  checkedIds: string[];
  onToggle: (id: string) => void;
}) {
  const remaining = items.filter((item) => !checkedIds.includes(item.id)).length;
  return (
    <section className="panel">
      <div className="habit-head">
        <h2>{categoryLabel(category)}</h2>
        <strong>
          {remaining}/{items.length}
        </strong>
      </div>
      <ul className="grocery">
        {items.map((item) => {
          const on = checkedIds.includes(item.id);
          return (
            <li key={item.id}>
              <button type="button" className={`grocery-line ${on ? "is-on" : ""}`} onClick={() => onToggle(item.id)}>
                <span>
                  <strong>{item.name}</strong>
                  {item.note ? <em>{item.note}</em> : null}
                </span>
                <b>{formatQty(item)}</b>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
