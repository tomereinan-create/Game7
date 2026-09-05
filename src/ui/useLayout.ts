import { useEffect, useLayoutEffect } from 'react'

/**
 * useLayoutEffect, except on the server, where it does nothing and React says so loudly.
 *
 * Several screens set a body class for their skin — the draft and My team widen the column, the map
 * picks its ground, the front door lights the tunnel — and a class that decides what the FIRST paint
 * looks like has to land before that paint, which is what a layout effect is for. But these screens
 * are also server-rendered by the tests, and useLayoutEffect on the server is a warning per render.
 * There is nothing for a server pass to do here in any case: no DOM to measure, no body to class.
 */
export const useLayout = typeof window === 'undefined' ? useEffect : useLayoutEffect
