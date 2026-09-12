import Image from "next/image";
import { DepthCard, DepthVisual } from "./DepthCard";

type Photo = { number: string; label: string; image: string; alt: string; copy: readonly string[] };
type Props = {
  photos: Photo[];
  language: "ja" | "en";
  classes: { grid: string; card: string; visual: string; copy?: string };
};

export function OffHoursGallery({ photos, language, classes }: Props) {
  return <div className={classes.grid}>
    {photos.map(photo => <DepthCard key={photo.label} depth="photo" editorial={language === "en"} className={classes.card}>
      <DepthVisual className={classes.visual} data-depth-photo>
        <Image decoding="sync" loading="eager" src={photo.image} alt={photo.alt} fill sizes={language === "en" ? "(min-width: 901px) 32vw, 92vw" : "(min-width: 901px) 32vw, 100vw"} />
        <span data-photo-number aria-hidden="true">{photo.number}</span>
      </DepthVisual>
      <div className={classes.copy}><h3>{photo.label}</h3><p>{language === "en" ? photo.copy[0] : photo.copy.map(line => <span key={line}>{line}</span>)}</p></div>
    </DepthCard>)}
  </div>;
}
