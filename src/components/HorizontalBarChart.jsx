import React from 'react'
import { motion } from 'framer-motion'

export default function HorizontalBarChart({ data, title, valuePrefix = '$' }) {
  const max = Math.max(...data.map(item => item.value), 1)

  return (
    <div className="bar-chart-card">
      <h3 className="chart-title">{title}</h3>
      <div className="chart-list">
        {data.map((item, index) => (
          <div key={index} className="chart-item">
            <div className="chart-label-row">
              <span className="chart-label">{item.label}</span>
              <span className="chart-value">{valuePrefix}{item.value.toLocaleString()}</span>
            </div>
            <div className="chart-bar-bg">
              <motion.div 
                className="chart-bar-fill"
                initial={{ width: 0 }}
                animate={{ width: `${(item.value / max) * 100}%` }}
                transition={{ duration: 1, delay: index * 0.1, ease: 'easeOut' }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
