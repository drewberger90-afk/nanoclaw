'use client'
import type { AgentPhoto, PhotoContextTag } from '@/types/photos'

const TAG_META: Record<PhotoContextTag, { label: string; color: string }> = {
  morning_routine: { label: 'Morning',         color: 'text-amber-400' },
  solo_reflection: { label: 'Reflecting',      color: 'text-indigo-400' },
  social_moment:   { label: 'Social',          color: 'text-emerald-400' },
  nature_escape:   { label: 'Outside',         color: 'text-teal-400' },
  creative_space:  { label: 'Creating',        color: 'text-purple-400' },
  late_night:      { label: 'Late Night',      color: 'text-slate-400' },
}

function PhotoCard({ photo }: { photo: AgentPhoto }) {
  if (photo.status === 'loading') {
    return (
      <div className="aspect-square rounded-2xl bg-arena-muted animate-pulse" />
    )
  }

  if (photo.status === 'error' || !photo.imageData) {
    return (
      <div className="aspect-square rounded-2xl bg-arena-card border border-arena-border flex flex-col items-center justify-center gap-2 p-3">
        <div className="text-2xl opacity-40">📷</div>
        <p className="text-[10px] text-slate-600 text-center">{photo.label}</p>
      </div>
    )
  }

  const tagMeta = TAG_META[photo.contextTag]

  return (
    <div className="group relative aspect-square rounded-2xl overflow-hidden cursor-pointer">
      {/* Image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.imageData}
        alt={photo.label}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
      />

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent
        opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${tagMeta?.color ?? 'text-slate-400'}`}>
            {tagMeta?.label ?? photo.contextTag}
          </span>
          <span className="text-slate-500 text-[10px]">·</span>
          <span className="text-slate-400 text-[10px]">{photo.timestamp}</span>
        </div>
        <p className="text-xs text-slate-200 leading-snug line-clamp-3 italic">"{photo.caption}"</p>
      </div>

      {/* Always-visible timestamp badge */}
      <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm rounded-full px-2 py-0.5
        text-[9px] text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">
        {photo.timestamp}
      </div>
    </div>
  )
}

export default function PhotoGallery({
  photos,
  loading,
}: {
  photos: AgentPhoto[]
  loading: boolean
}) {
  // During initial load before fetch, show skeleton grid
  if (loading && photos.length === 0) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="aspect-square rounded-2xl bg-arena-muted animate-pulse" />
        ))}
      </div>
    )
  }

  if (!loading && photos.length === 0) {
    return (
      <div className="text-center py-16 text-slate-600">
        <div className="text-3xl mb-3">📷</div>
        <p className="text-sm">No photos available</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {photos.map(photo => (
        <PhotoCard key={photo.id} photo={photo} />
      ))}
    </div>
  )
}
