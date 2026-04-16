import React from 'react'

export default function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton-img"></div>
      <div className="skeleton-content">
        <div className="skeleton-line title"></div>
        <div className="skeleton-line price"></div>
        <div className="skeleton-footer">
          <div className="skeleton-badge"></div>
          <div className="skeleton-circle"></div>
        </div>
      </div>
    </div>
  )
}
