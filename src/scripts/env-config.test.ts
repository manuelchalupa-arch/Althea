import { describe, expect, it } from 'vitest'
import {
  projectVarForMode,
  siteVarForMode,
  envFileForMode,
  isMode,
  isPlaceholder,
  parseHttpsHost,
  stripQuotes,
  parseEnvFile,
  resolveEnvValue,
  resolveEnvValues,
  validateBuildEnv,
  buildEnvFileContent,
  buildFirebasercContent,
  ensureGitignoreEntry,
  checkFirestoreE2eTarget,
} from '../../scripts/lib/env-config.mjs'

describe('env-config', () => {
  it('project/site/env helpers', () => {
    expect(projectVarForMode('staging')).toBe('FIREBASE_STAGING_PROJECT_ID')
    expect(projectVarForMode('production')).toBe('FIREBASE_PRODUCTION_PROJECT_ID')
    expect(siteVarForMode('staging')).toBe('FIREBASE_STAGING_SITE_ID')
    expect(siteVarForMode('production')).toBe('FIREBASE_PRODUCTION_SITE_ID')
    expect(envFileForMode('staging')).toBe('.env.staging')
    expect(envFileForMode('production')).toBe('.env.production')
    expect(isMode('staging')).toBe(true)
    expect(isMode('prod')).toBe(false)
  })

  it('stripQuotes y placeholders', () => {
    expect(stripQuotes('"valor"')).toBe('valor')
    expect(stripQuotes("'valor'")).toBe('valor')
    expect(isPlaceholder('REEMPLAZAR')).toBe(true)
    expect(isPlaceholder('tu-proyecto')).toBe(true)
    expect(isPlaceholder('STAGING_PROJECT_ID')).toBe(true)
    expect(isPlaceholder('mi-proyecto-123')).toBe(false)
  })

  it('parseHttpsHost', () => {
    expect(parseHttpsHost('https://althea-proxy-staging.workers.dev')).toContain('workers.dev')
    expect(parseHttpsHost('http://ejemplo.com')).toBeNull()
    expect(parseHttpsHost('')).toBeNull()
  })

  it('parseEnvFile parsea líneas con espacios y comillas', () => {
    const txt = `# comentario\nKEY=valor\nQUOTED="con espacios y #hash"\nSINGLE='val'\nTRIM=  valor  \nEMPTY=\n`
    const p = parseEnvFile(txt)
    expect(p.KEY).toBe('valor')
    expect(p.QUOTED).toBe('con espacios y #hash')
    expect(p.SINGLE).toBe('val')
    expect(p.TRIM).toBe('valor')
    expect(p.EMPTY).toBe('')
  })

  it('resolveEnvValue con precedencia', () => {
    const layers: Array<Record<string, string> | undefined> = [{ A: '1' }, { A: '2', B: 'b' }, undefined]
    expect(resolveEnvValue('A', layers)).toBe('1')
    expect(resolveEnvValue('B', layers)).toBe('b')
    expect(resolveEnvValue('C', layers)).toBe('')
  })

  it('resolveEnvValues devuelve un mapa', () => {
    const layers = [{ X: 'x' }]
    const r = resolveEnvValues(['X', 'Y'], layers)
    expect(r.X).toBe('x')
    expect(r.Y).toBe('')
  })

  it('validateBuildEnv rechaza placeholders y cruces', () => {
    const invalid = validateBuildEnv({
      mode: 'staging',
      values: {
        VITE_FIREBASE_API_KEY: 'k',
        VITE_FIREBASE_AUTH_DOMAIN: 'a.firebaseapp.com',
        VITE_FIREBASE_PROJECT_ID: 'REEMPLAZAR',
        VITE_FIREBASE_STORAGE_BUCKET: 'b',
        VITE_FIREBASE_MESSAGING_SENDER_ID: 'm',
        VITE_FIREBASE_APP_ID: 'app',
        VITE_GROQ_PROXY_URL: 'REEMPLAZAR',
        FIREBASE_STAGING_PROJECT_ID: 'REEMPLAZAR',
      },
    })
    expect(invalid.ok).toBe(false)

    const cross = validateBuildEnv({
      mode: 'staging',
      values: {
        VITE_FIREBASE_API_KEY: 'k',
        VITE_FIREBASE_AUTH_DOMAIN: 'a.firebaseapp.com',
        VITE_FIREBASE_PROJECT_ID: 'p-stg',
        VITE_FIREBASE_STORAGE_BUCKET: 'b',
        VITE_FIREBASE_MESSAGING_SENDER_ID: 'm',
        VITE_FIREBASE_APP_ID: 'app',
        VITE_GROQ_PROXY_URL: 'https://worker.workers.dev',
        FIREBASE_STAGING_PROJECT_ID: 'p-prod',
      },
      otherProjectId: 'p-prod',
    })
    expect(cross.ok).toBe(false)

    const ok = validateBuildEnv({
      mode: 'staging',
      values: {
        VITE_FIREBASE_API_KEY: 'k',
        VITE_FIREBASE_AUTH_DOMAIN: 'a.firebaseapp.com',
        VITE_FIREBASE_PROJECT_ID: 'p-stg',
        VITE_FIREBASE_STORAGE_BUCKET: 'b',
        VITE_FIREBASE_MESSAGING_SENDER_ID: 'm',
        VITE_FIREBASE_APP_ID: 'app',
        VITE_GROQ_PROXY_URL: 'https://worker-staging.workers.dev',
        FIREBASE_STAGING_PROJECT_ID: 'p-stg',
      },
      otherProjectId: 'p-prod',
      otherWorkerName: 'althea-proxy-production',
    })
    expect(ok.ok).toBe(true)
    expect(ok.summary.project).toBe('p-stg')
  })

  it('staging no debe apuntar al Worker de production', () => {
    const res = validateBuildEnv({
      mode: 'staging',
      values: {
        VITE_FIREBASE_API_KEY: 'k',
        VITE_FIREBASE_AUTH_DOMAIN: 'a.firebaseapp.com',
        VITE_FIREBASE_PROJECT_ID: 'p-stg',
        VITE_FIREBASE_STORAGE_BUCKET: 'b',
        VITE_FIREBASE_MESSAGING_SENDER_ID: 'm',
        VITE_FIREBASE_APP_ID: 'app',
        VITE_GROQ_PROXY_URL: 'https://althea-proxy-production.workers.dev',
        FIREBASE_STAGING_PROJECT_ID: 'p-stg',
      },
      otherProjectId: 'p-prod',
      otherWorkerName: 'althea-proxy-production',
    })
    expect(res.ok).toBe(false)
  })

  it('buildEnvFileContent genera comentarios y variables', () => {
    const out = buildEnvFileContent({
      mode: 'staging',
      values: {
        VITE_FIREBASE_API_KEY: 'k',
        VITE_FIREBASE_AUTH_DOMAIN: 'd',
        VITE_FIREBASE_PROJECT_ID: 'p',
        VITE_FIREBASE_STORAGE_BUCKET: 's',
        VITE_FIREBASE_MESSAGING_SENDER_ID: 'm',
        VITE_FIREBASE_APP_ID: 'a',
        VITE_GROQ_PROXY_URL: 'https://w',
      },
    })
    expect(out).toContain('VITE_GROQ_PROXY_URL=https://w')
  })

  it('buildFirebasercContent genera alias y exige proyectos distintos', () => {
    const ok = buildFirebasercContent({
      stagingProjectId: 'p-stg',
      productionProjectId: 'p-prod',
      stagingSiteId: 's',
      productionSiteId: 'p-prod',
    })
    expect(ok).toContain('"staging": "p-stg"')
    expect(() =>
      buildFirebasercContent({
        stagingProjectId: 'p',
        productionProjectId: 'p',
        stagingSiteId: 'p',
        productionSiteId: 'p',
      }),
    ).toThrow()
  })

  it('ensureGitignoreEntry no duplica ni corrompe', () => {
    const a = ensureGitignoreEntry('# init\n.env\n', '.firebaserc')
    expect(a.changed).toBe(true)
    expect(a.content).toContain('.firebaserc')
    const b = ensureGitignoreEntry(a.content, '.firebaserc')
    expect(b.changed).toBe(false)
  })

  it('checkFirestoreE2eTarget: exige la identidad de staging y nunca corre contra producción', () => {
    // Falta el proyecto o la API key.
    expect(checkFirestoreE2eTarget({})).toMatchObject({ ok: false, level: 'block', code: 'MISSING_PROJECT' })
    expect(checkFirestoreE2eTarget({ projectId: 'p' })).toMatchObject({ ok: false, code: 'MISSING_API_KEY' })

    // Falta la identidad declarada de staging (agujero histórico: con esto el
    // script podía correr contra `.env.local` apuntando a producción).
    expect(checkFirestoreE2eTarget({ projectId: 'p', apiKey: 'k' })).toMatchObject({
      ok: false,
      level: 'block',
      code: 'MISSING_STAGING_ID',
    })

    // El destino no es el declarado como staging.
    expect(
      checkFirestoreE2eTarget({ projectId: 'p', apiKey: 'k', stagingId: 'otro' }),
    ).toMatchObject({ ok: false, level: 'block', code: 'PROJECT_NOT_STAGING' })

    // staging y production son el mismo proyecto => abortar.
    expect(
      checkFirestoreE2eTarget({ projectId: 'mismo', apiKey: 'k', stagingId: 'mismo', productionId: 'mismo' }),
    ).toMatchObject({ ok: false, level: 'abort', code: 'STAGING_IS_PRODUCTION' })

    // Caso válido: destino = staging declarado, distinto de producción.
    expect(
      checkFirestoreE2eTarget({ projectId: 'stg', apiKey: 'k', stagingId: 'stg', productionId: 'prod' }),
    ).toMatchObject({ ok: true, level: 'ok', code: 'OK' })

    // Si el "staging" declarado es en realidad producción, se rechaza.
    expect(
      checkFirestoreE2eTarget({ projectId: 'prod', apiKey: 'k', stagingId: 'prod', productionId: 'prod' }),
    ).toMatchObject({ ok: false, level: 'abort' })
    expect(
      checkFirestoreE2eTarget({ projectId: 'prod', apiKey: 'k', stagingId: 'stg', productionId: 'prod' }),
    ).toMatchObject({ ok: false, level: 'block', code: 'PROJECT_NOT_STAGING' })
  })
})
