import Image from "next/image";

// Галерея из фото в public/photos: сетка с разной высотой карточек, скругления и мягкая тень в стиле интерфейса.
export function Gallery({ photos }: { photos: string[] }) {
  if (photos.length === 0) return null;
  return (
    <section aria-label="Атмосфера и кухня" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="vm-eyebrow">Атмосфера и кухня</span>
        <h2 className="text-4xl font-bold">
          Вечер у воды, <em className="font-semibold text-vm-green">на вкус</em>
        </h2>
      </div>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {photos.map((src, i) => (
          <li
            key={src}
            className={`relative overflow-hidden rounded-[var(--r-lg)] shadow-[var(--shadow-glass)] ${i % 5 === 0 ? "row-span-2 aspect-[3/4] md:aspect-auto md:min-h-[26rem]" : "aspect-square"}`}
          >
            <Image src={src} alt="" fill sizes="(min-width: 768px) 25vw, 50vw" className="object-cover" />
          </li>
        ))}
      </ul>
    </section>
  );
}
