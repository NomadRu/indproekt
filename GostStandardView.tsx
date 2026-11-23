import { Check } from 'lucide-react';

export function GostStandardView() {
  const currentYear = new Date().getFullYear();
  const minYear = currentYear - 7;

  const TYPOGRAPHY_SPECS = [
    { label: 'Стандарт оформления', value: 'ГОСТ 7.32-2017 (Отчёт о НИР / учебный проект)' },
    { label: 'Формат бумаги', value: 'A4 (210 × 297 мм), книжная ориентация' },
    { label: 'Левое поле', value: '30 мм (для брошюровки и подшивки)' },
    { label: 'Правое поле', value: '15 мм' },
    { label: 'Верхнее и нижнее поля', value: '20 мм' },
    { label: 'Основной шрифт', value: 'Times New Roman, 14 пт, начертание обычное, цвет чёрный' },
    { label: 'Межстрочный интервал', value: '1,5 строки' },
    { label: 'Абзацный отступ', value: '1,25 см (одинаковый по всему тексту)' },
    { label: 'Выравнивание текста', value: 'По ширине (заголовки разделов — по центру)' },
    { label: 'Нумерация страниц', value: 'Арабскими цифрами внизу по центру, начиная со 2-й страницы' },
    { label: 'Библиографические источники', value: `ГОСТ Р 7.0.5-2008 · не старше 7 лет (${minYear}–${currentYear} гг.)` },
  ];

  const STRUCTURE_ITEMS = [
    {
      title: '1. Титульный лист',
      detail: 'Полное наименование учебного заведения, предмет, вид работы («ИНДИВИДУАЛЬНЫЙ ПРОЕКТ»), тема в кавычках, данные обучающегося и руководителя с выравниванием в правый блок, город и год внизу без номера страницы.',
    },
    {
      title: '2. Содержание и Введение',
      detail: 'Содержание начинается со 2-й страницы. Введение содержит научный аппарат проекта: актуальность, проблему, цель, задачи, объект, предмет, гипотезу, методы исследования и практическую значимость.',
    },
    {
      title: '3. Основная часть (от 2 до 4 глав, до 20 страниц)',
      detail: 'Количество глав и целевой объём страниц выбираются перед генерацией. В главы включаются аналитические таблицы (подпись сверху «Таблица N – ...») и структурные блок-схемы (подпись снизу «Рисунок N – ...»), а в финальную главу — паспорт проектного продукта.',
    },
    {
      title: '4. Заключение и Список использованных источников',
      detail: `Итоги выполнения каждой задачи, оценка достижения цели и список источников строго не старше 7 лет (${minYear}–${currentYear} гг.). Приложение А не формируется.`,
    },
    {
      title: '5. Презентация на 10 слайдов (.pptx) и Речь для защиты (.docx)',
      detail: 'Формируются автоматически для каждого проекта: 10 слайдов формата 16:9 с таблицами и заметками спикера, а также полный текст устного выступления с ответами на 5 вероятных вопросов комиссии.',
    },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <section className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-base font-semibold text-slate-900">
          Технические требования ГОСТ 7.32-2017
        </h2>
        <p className="text-sm text-slate-600 mt-1 mb-5">
          Все параметры применяются автоматически при сборке файла .docx на сервере.
        </p>

        <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
          {TYPOGRAPHY_SPECS.map((spec) => (
            <div
              key={spec.label}
              className="flex items-start justify-between gap-4 px-4 py-3 text-sm"
            >
              <span className="text-slate-600 shrink-0">{spec.label}</span>
              <span className="font-medium text-slate-900 text-right tabular-nums">
                {spec.value}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-base font-semibold text-slate-900">
          Состав комплекта и структура проекта
        </h2>
        <p className="text-sm text-slate-600 mt-1 mb-5">
          Соответствует требованиям ФГОС: от 2 до 4 глав, до 20 страниц, без Приложения А.
        </p>

        <div className="space-y-4">
          {STRUCTURE_ITEMS.map((item) => (
            <div key={item.title} className="pb-4 border-b border-slate-200 last:border-b-0 last:pb-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{item.title}</span>
              </div>
              <p className="text-sm text-slate-600 mt-1 pl-6 leading-relaxed">
                {item.detail}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
