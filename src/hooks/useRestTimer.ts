import { useState, useRef, useEffect, useCallback } from 'react'

export function useRestTimer(){
  const [restSec, setRestSec] = useState(0)
  const [restPaused, setRestPaused] = useState(false)
  const [restFlash, setRestFlash] = useState(false)
  const restPausedRef = useRef(false)
  const restSecRef = useRef(0)

  useEffect(()=>{
    restSecRef.current = restSec
  }, [restSec])

  useEffect(()=>{
    const iv = setInterval(()=>{
      if(restPausedRef.current) {return}
      if(restSecRef.current > 0){
        restSecRef.current -= 1
        setRestSec(restSecRef.current)
        if(restSecRef.current === 0) {setRestFlash(true)}
      }
    }, 1000)
    return ()=> clearInterval(iv)
  }, [])

  const startRest = useCallback((seconds:number)=>{
    setRestSec(seconds)
    setRestFlash(false)
    setRestPaused(false)
    restPausedRef.current = false
  }, [])

  const pauseRest = useCallback(()=>{
    setRestPaused(true)
    restPausedRef.current = true
  }, [])

  const resumeRest = useCallback(()=>{
    setRestPaused(false)
    restPausedRef.current = false
  }, [])

  const adjustRest = useCallback((delta:number)=>{
    setRestSec(s => Math.max(0, s + delta))
  }, [])

  const skipRest = useCallback(()=>{
    setRestSec(0)
    setRestFlash(false)
  }, [])

  const dismissFlash = useCallback(()=>{
    setRestFlash(false)
  }, [])

  return { restSec, restPaused, restFlash, startRest, pauseRest, resumeRest, adjustRest, skipRest, dismissFlash }
}
