import { Component } from 'react'
import { useLocation } from 'react-router-dom'

function keysChanged(prevKeys, nextKeys) {
  if (!prevKeys && !nextKeys) return false
  if (!prevKeys || !nextKeys) return true
  if (prevKeys.length !== nextKeys.length) return true
  return prevKeys.some((key, index) => key !== nextKeys[index])
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
    this.reset = this.reset.bind(this)
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo?.componentStack)
  }

  componentDidUpdate(prevProps) {
    const { resetKeys } = this.props
    if (this.state.hasError && keysChanged(prevProps.resetKeys, resetKeys)) {
      this.reset()
    }
  }

  reset() {
    const { onReset } = this.props
    this.setState({ hasError: false, error: null })
    onReset?.()
  }

  render() {
    const { hasError, error } = this.state
    const { children, fallback } = this.props

    if (hasError) {
      if (typeof fallback === 'function') {
        return fallback(error, this.reset)
      }
      return null
    }

    return children
  }
}

export function RouteErrorBoundary({ children, fallback, onReset }) {
  const location = useLocation()
  return (
    <ErrorBoundary
      resetKeys={[location.pathname]}
      fallback={fallback}
      onReset={onReset}
    >
      {children}
    </ErrorBoundary>
  )
}
