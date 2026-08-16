import { emptyProduct, type CatalogProduct } from "../shared/catalog.ts";
import {
  emptyGoal,
  emptyMeal,
  emptyOption,
  emptyRecommendation,
  emptySlot,
  type Highlight,
  type MealTone,
  type Plan,
  type SlotKind,
} from "../shared/plan.ts";
import { formatTime12, partsFromTime, toTime24 } from "../shared/schedule.ts";

const TONES: MealTone[] = ["green", "amber", "red", "muted"];
const TONE_LABEL: Record<MealTone, string> = {
  green: "Verde",
  amber: "Ámbar",
  red: "Rojo",
  muted: "Neutro",
};

type EditorProps = {
  plan: Plan;
  busy: boolean;
  error: string;
  onChange: (plan: Plan) => void;
  onSave: () => void;
  onCancel: () => void;
};

export function Editor({ plan, busy, error, onChange, onSave, onCancel }: EditorProps) {
  return (
    <main className="page editor">
      <header className="topbar">
        <div>
          <p className="eyebrow">Panel</p>
          <h1>Editar plan alimenticio</h1>
        </div>
        <button type="button" className="ghost" onClick={onCancel}>
          Ver
        </button>
      </header>

      <label>
        Título
        <input
          value={plan.title}
          onChange={(event) => onChange({ ...plan, title: event.target.value })}
        />
      </label>

      <div className="row-2">
        <label>
          Empieza el ciclo
          <input
            type="date"
            value={plan.startedOn}
            onChange={(event) => onChange({ ...plan, startedOn: event.target.value })}
          />
        </label>
        <label>
          Próxima consulta
          <input
            type="date"
            value={plan.consultOn}
            onChange={(event) => onChange({ ...plan, consultOn: event.target.value })}
          />
        </label>
      </div>
      <label>
        Costo de la consulta (MXN)
        <input
          type="number"
          min={0}
          step="50"
          value={plan.consultFeeMxn}
          onChange={(event) =>
            onChange({ ...plan, consultFeeMxn: Math.max(0, Number(event.target.value) || 0) })
          }
        />
      </label>

      <h2>Horario del día</h2>
      <p className="lede">
        El almuerzo queda a las 2:00 pm. El resto se reparte entre las 7:00 am y las 8:30 pm.
      </p>
      {plan.schedule.map((slot, index) => (
        <fieldset key={slot.id} className="block">
          <div className="row">
            <label>
              Hora ({formatTime12(slot.time)})
              <TimePicker
                value={slot.time}
                onChange={(time) => {
                  const schedule = plan.schedule.map((item, i) =>
                    i === index ? { ...item, time } : item,
                  );
                  onChange({ ...plan, schedule });
                }}
              />
            </label>
            <label>
              Tipo
              <select
                value={slot.kind}
                onChange={(event) => {
                  const kind = event.target.value as SlotKind;
                  const schedule = plan.schedule.map((item, i) =>
                    i === index
                      ? { ...item, kind, mealId: kind === "meal" ? item.mealId : null }
                      : item,
                  );
                  onChange({ ...plan, schedule });
                }}
              >
                <option value="meal">Comida</option>
                <option value="supplement">Suplemento</option>
              </select>
            </label>
          </div>
          <label>
            Nombre
            <input
              value={slot.title}
              onChange={(event) => {
                const schedule = plan.schedule.map((item, i) =>
                  i === index ? { ...item, title: event.target.value } : item,
                );
                onChange({ ...plan, schedule });
              }}
            />
          </label>
          {slot.kind === "meal" ? (
            <label>
              Platillo
              <select
                value={slot.mealId ?? ""}
                onChange={(event) => {
                  const mealId = event.target.value || null;
                  const schedule = plan.schedule.map((item, i) =>
                    i === index ? { ...item, mealId } : item,
                  );
                  onChange({ ...plan, schedule });
                }}
              >
                <option value="">Elegir platillo</option>
                {plan.meals.map((meal) => (
                  <option key={meal.id} value={meal.id}>
                    {meal.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            Nota
            <textarea
              rows={2}
              value={slot.detail}
              onChange={(event) => {
                const schedule = plan.schedule.map((item, i) =>
                  i === index ? { ...item, detail: event.target.value } : item,
                );
                onChange({ ...plan, schedule });
              }}
            />
          </label>
          <button
            type="button"
            className="danger"
            onClick={() =>
              onChange({
                ...plan,
                schedule: plan.schedule.filter((item) => item.id !== slot.id),
              })
            }
          >
            Quitar horario
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="ghost"
        onClick={() => onChange({ ...plan, schedule: [...plan.schedule, emptySlot()] })}
      >
        Añadir horario
      </button>

      <h2>Objetivos</h2>
      {plan.goals.map((goal, index) => (
        <fieldset key={goal.id} className="block">
          <input
            value={goal.title}
            onChange={(event) => {
              const goals = plan.goals.map((item, i) =>
                i === index ? { ...item, title: event.target.value } : item,
              );
              onChange({ ...plan, goals });
            }}
          />
          <textarea
            rows={3}
            value={goal.body}
            onChange={(event) => {
              const goals = plan.goals.map((item, i) =>
                i === index ? { ...item, body: event.target.value } : item,
              );
              onChange({ ...plan, goals });
            }}
          />
          <button
            type="button"
            className="danger"
            onClick={() =>
              onChange({ ...plan, goals: plan.goals.filter((item) => item.id !== goal.id) })
            }
          >
            Quitar objetivo
          </button>
        </fieldset>
      ))}
      <button type="button" className="ghost" onClick={() => onChange({ ...plan, goals: [...plan.goals, emptyGoal()] })}>
        Añadir objetivo
      </button>

      <h2>Comidas</h2>
      {plan.meals.map((meal, mealIndex) => (
        <fieldset key={meal.id} className="block">
          <div className="row">
            <label>
              Comida
              <input
                value={meal.name}
                onChange={(event) => {
                  const meals = plan.meals.map((item, i) =>
                    i === mealIndex ? { ...item, name: event.target.value } : item,
                  );
                  onChange({ ...plan, meals });
                }}
              />
            </label>
            <label>
              kcal
              <input
                inputMode="numeric"
                value={meal.kcal ?? ""}
                onChange={(event) => {
                  const raw = event.target.value.trim();
                  const parsed = raw === "" ? null : Number(raw);
                  const kcal = typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
                  const meals = plan.meals.map((item, i) =>
                    i === mealIndex ? { ...item, kcal } : item,
                  );
                  onChange({ ...plan, meals });
                }}
              />
            </label>
          </div>

          {meal.options.map((option, optionIndex) => (
            <div key={option.id} className="option-edit">
              <label>
                Opción
                <input
                  value={option.title}
                  onChange={(event) => {
                    const meals = plan.meals.map((item, i) => {
                      if (i !== mealIndex) return item;
                      const options = item.options.map((opt, j) =>
                        j === optionIndex ? { ...opt, title: event.target.value } : opt,
                      );
                      return { ...item, options };
                    });
                    onChange({ ...plan, meals });
                  }}
                />
              </label>
              <label>
                Color
                <select
                  value={option.tone}
                  onChange={(event) => {
                    const tone = event.target.value as MealTone;
                    const meals = plan.meals.map((item, i) => {
                      if (i !== mealIndex) return item;
                      const options = item.options.map((opt, j) =>
                        j === optionIndex ? { ...opt, tone } : opt,
                      );
                      return { ...item, options };
                    });
                    onChange({ ...plan, meals });
                  }}
                >
                  {TONES.map((tone) => (
                    <option key={tone} value={tone}>
                      {TONE_LABEL[tone]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Ingredientes (uno por línea)
                <textarea
                  rows={5}
                  value={option.items.join("\n")}
                  onChange={(event) => {
                    const items = event.target.value.split("\n");
                    const meals = plan.meals.map((item, i) => {
                      if (i !== mealIndex) return item;
                      const options = item.options.map((opt, j) =>
                        j === optionIndex ? { ...opt, items } : opt,
                      );
                      return { ...item, options };
                    });
                    onChange({ ...plan, meals });
                  }}
                />
              </label>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  const meals = plan.meals.map((item, i) =>
                    i === mealIndex
                      ? { ...item, options: item.options.filter((opt) => opt.id !== option.id) }
                      : item,
                  );
                  onChange({ ...plan, meals });
                }}
              >
                Quitar opción
              </button>
            </div>
          ))}

          <button
            type="button"
            className="ghost"
            onClick={() => {
              const meals = plan.meals.map((item, i) =>
                i === mealIndex ? { ...item, options: [...item.options, emptyOption()] } : item,
              );
              onChange({ ...plan, meals });
            }}
          >
            Añadir opción
          </button>
          <button
            type="button"
            className="danger"
            onClick={() =>
              onChange({ ...plan, meals: plan.meals.filter((item) => item.id !== meal.id) })
            }
          >
            Quitar comida
          </button>
        </fieldset>
      ))}
      <button type="button" className="ghost" onClick={() => onChange({ ...plan, meals: [...plan.meals, emptyMeal()] })}>
        Añadir comida
      </button>

      <h2>Recomendaciones</h2>
      {plan.recommendations.map((item, index) => (
        <fieldset key={item.id} className="block">
          <textarea
            rows={3}
            value={item.text}
            onChange={(event) => {
              const recommendations = plan.recommendations.map((rec, i) =>
                i === index ? { ...rec, text: event.target.value } : rec,
              );
              onChange({ ...plan, recommendations });
            }}
          />
          <label>
            Destacado
            <select
              value={item.highlight ?? "none"}
              onChange={(event) => {
                const value = event.target.value;
                const highlight: Highlight = value === "none" ? null : (value as Highlight);
                const recommendations = plan.recommendations.map((rec, i) =>
                  i === index ? { ...rec, highlight } : rec,
                );
                onChange({ ...plan, recommendations });
              }}
            >
              <option value="none">Normal</option>
              <option value="ok">Verde</option>
              <option value="warn">Amarillo</option>
            </select>
          </label>
          <button
            type="button"
            className="danger"
            onClick={() =>
              onChange({
                ...plan,
                recommendations: plan.recommendations.filter((rec) => rec.id !== item.id),
              })
            }
          >
            Quitar
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="ghost"
        onClick={() =>
          onChange({
            ...plan,
            recommendations: [...plan.recommendations, emptyRecommendation()],
          })
        }
      >
        Añadir recomendación
      </button>

      <h2>Productos de despensa</h2>
      <p className="lede">
        Marca, empaque y precio de recarga. Si no hay marca, no pasa nada. La proteína de recarga va
        a $650 y la creatina a $400; el kit de $1,050 ya fue la promo.
      </p>
      {plan.products.map((product, index) => (
        <ProductFields
          key={product.id}
          product={product}
          onChange={(next) => {
            const products = plan.products.map((item, i) => (i === index ? next : item));
            onChange({ ...plan, products });
          }}
          onRemove={() =>
            onChange({
              ...plan,
              products: plan.products.filter((item) => item.id !== product.id),
            })
          }
        />
      ))}
      <button
        type="button"
        className="ghost"
        onClick={() => onChange({ ...plan, products: [...plan.products, emptyProduct()] })}
      >
        Añadir producto
      </button>

      <label>
        Cardio
        <textarea
          rows={3}
          value={plan.cardio}
          onChange={(event) => onChange({ ...plan, cardio: event.target.value })}
        />
      </label>

      <label>
        Notas extra (una por línea)
        <textarea
          rows={3}
          value={plan.extras.join("\n")}
          onChange={(event) => onChange({ ...plan, extras: event.target.value.split("\n") })}
        />
      </label>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="save-bar">
        <button type="button" className="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button type="button" onClick={onSave} disabled={busy}>
          {busy ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </main>
  );
}

function ProductFields({
  product,
  onChange,
  onRemove,
}: {
  product: CatalogProduct;
  onChange: (product: CatalogProduct) => void;
  onRemove: () => void;
}) {
  return (
    <fieldset className="block">
      <label>
        Nombre
        <input value={product.name} onChange={(event) => onChange({ ...product, name: event.target.value })} />
      </label>
      <div className="row-2">
        <label>
          Marca
          <input value={product.brand} onChange={(event) => onChange({ ...product, brand: event.target.value })} />
        </label>
        <label>
          Tienda
          <input value={product.store} onChange={(event) => onChange({ ...product, store: event.target.value })} />
        </label>
      </div>
      <label>
        Empaque
        <input
          value={product.packLabel}
          onChange={(event) => onChange({ ...product, packLabel: event.target.value })}
          placeholder="2 botes de 900 g"
        />
      </label>
      <div className="row-2">
        <label>
          Gramos o ml del empaque
          <input
            type="number"
            min={0}
            step="any"
            value={product.packQty}
            onChange={(event) => onChange({ ...product, packQty: Number(event.target.value) || 0 })}
          />
        </label>
        <label>
          Precio (MXN)
          <input
            type="number"
            min={0}
            step="0.01"
            value={product.priceMxn ?? ""}
            onChange={(event) =>
              onChange({
                ...product,
                priceMxn: event.target.value === "" ? null : Number(event.target.value),
              })
            }
            placeholder="Si no lo sabes, déjalo vacío"
          />
        </label>
      </div>
      <div className="row-2">
        <label>
          Porciones del empaque
          <input
            type="number"
            min={0}
            step="any"
            value={product.servings ?? ""}
            onChange={(event) =>
              onChange({
                ...product,
                servings: event.target.value === "" ? null : Number(event.target.value),
              })
            }
          />
        </label>
        <label>
          Gramos por porción
          <input
            type="number"
            min={0}
            step="any"
            value={product.servingQty ?? ""}
            onChange={(event) =>
              onChange({
                ...product,
                servingQty: event.target.value === "" ? null : Number(event.target.value),
              })
            }
          />
        </label>
      </div>
      <label>
        Coincide con el menú (palabras, separadas por coma)
        <input
          value={product.match.join(", ")}
          onChange={(event) =>
            onChange({
              ...product,
              match: event.target.value
                .split(",")
                .map((token) => token.trim().toLowerCase())
                .filter(Boolean),
            })
          }
        />
      </label>
      <label>
        Este empaque lo abrí el
        <input
          type="date"
          value={product.openedOn ?? ""}
          onChange={(event) => onChange({ ...product, openedOn: event.target.value || null })}
        />
      </label>
      <label>
        Nota
        <textarea
          rows={2}
          value={product.note}
          onChange={(event) => onChange({ ...product, note: event.target.value })}
        />
      </label>
      <button type="button" className="danger" onClick={onRemove}>
        Quitar producto
      </button>
    </fieldset>
  );
}

function TimePicker({ value, onChange }: { value: string; onChange: (time: string) => void }) {
  const parts = partsFromTime(value);
  const minutes = [...new Set([0, 15, 30, 45, parts.minute])].sort((a, b) => a - b);

  return (
    <div className="time-12">
      <select
        value={parts.hour12}
        onChange={(event) =>
          onChange(toTime24(Number(event.target.value), parts.minute, parts.meridiem))
        }
      >
        {Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => (
          <option key={hour} value={hour}>
            {hour}
          </option>
        ))}
      </select>
      <select
        value={parts.minute}
        onChange={(event) =>
          onChange(toTime24(parts.hour12, Number(event.target.value), parts.meridiem))
        }
      >
        {minutes.map((minute) => (
          <option key={minute} value={minute}>
            {String(minute).padStart(2, "0")}
          </option>
        ))}
      </select>
      <select
        value={parts.meridiem}
        onChange={(event) =>
          onChange(toTime24(parts.hour12, parts.minute, event.target.value as "am" | "pm"))
        }
      >
        <option value="am">am</option>
        <option value="pm">pm</option>
      </select>
    </div>
  );
}
