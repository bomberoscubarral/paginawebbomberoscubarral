import React, { useEffect, useMemo, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import {
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  onSnapshot,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { auth, db, storage } from './firebase'

const BRAND = {
  name: 'Cuerpo de Bomberos Voluntarios de Cubarral Meta',
  short: 'Bomberos Cubarral',
  emergencyPhone: '123',
  whatsappPhone: '57XXXXXXXXXX', // Reemplaza por el número institucional con indicativo país
  whatsappDisplay: '+57 XXX XXX XXXX',
  address: 'Cubarral, Meta, Colombia',
  facebook: 'https://facebook.com/',
  instagram: 'https://instagram.com/',
  tiktok: 'https://tiktok.com/',
  youtube: 'https://youtube.com/',
}

const initialNewsForm = {
  title: '',
  publishedAt: new Date().toISOString().slice(0, 10),
  content: '',
  imageUrl: '',
}

const initialCertForm = {
  nit: '',
  name: '',
  issueDate: '',
  expiryDate: '',
  pdfUrl: '',
  status: 'Vigente',
  qrCodeId: '',
}

function formatDate(value) {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function normalizeId(value) {
  return String(value || '').trim().replace(/\s+/g, '')
}

function isExpired(expiryDate) {
  if (!expiryDate) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const end = new Date(expiryDate)
  end.setHours(23, 59, 59, 999)
  return end < today
}

function encodeWhatsAppMessage(data) {
  const msg = [
    'Solicitud de inspección / certificación de seguridad',
    `Establecimiento: ${data.name || 'No registrado'}`,
    `NIT / identificación: ${data.nit || 'No registrado'}`,
    `Nombre de contacto: ${data.contactName || 'No registrado'}`,
    `Teléfono: ${data.phone || 'No registrado'}`,
    `Dirección: ${data.address || 'No registrada'}`,
    `Actividad comercial: ${data.activity || 'No registrada'}`,
    `Observación: ${data.observation || 'Sin observaciones'}`,
  ].join('\n')
  return encodeURIComponent(msg)
}

export default function App() {
  const [user, setUser] = useState(null)
  const [authMode, setAuthMode] = useState(false)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [news, setNews] = useState([])
  const [loadingNews, setLoadingNews] = useState(true)
  const [newsForm, setNewsForm] = useState(initialNewsForm)
  const [certForm, setCertForm] = useState(initialCertForm)
  const [uploading, setUploading] = useState(false)

  const [searchValue, setSearchValue] = useState('')
  const [searchResult, setSearchResult] = useState(null)
  const [searchState, setSearchState] = useState('idle')
  const [requestForm, setRequestForm] = useState({
    name: '',
    nit: '',
    contactName: '',
    phone: '',
    address: '',
    activity: '',
    observation: '',
  })

  const verificationBaseUrl = useMemo(() => {
    return `${window.location.origin}${window.location.pathname}`
  }, [])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
      setAuthMode(false)
      setAuthError('')
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const q = query(collection(db, 'news'), orderBy('createdAt', 'desc'), limit(12))
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setNews(
          snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }))
        )
        setLoadingNews(false)
      },
      () => {
        setLoadingNews(false)
      }
    )
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const cert = normalizeId(params.get('cert'))
    if (cert) {
      setSearchValue(cert)
      lookupCertificate(cert)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleLogin(e) {
    e.preventDefault()
    setAuthError('')
    try {
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword)
      setAuthMode(false)
      setLoginPassword('')
    } catch (error) {
      setAuthError('No fue posible iniciar sesión. Verifica tu correo y contraseña.')
    }
  }

  async function handleLogout() {
    await signOut(auth)
  }

  async function uploadImage(file) {
    if (!file) return ''
    const safeName = file.name.replace(/[^\w.-]+/g, '_')
    const path = `news/${Date.now()}_${safeName}`
    const storageRef = ref(storage, path)
    await uploadBytes(storageRef, file)
    return await getDownloadURL(storageRef)
  }

  async function saveNews(e) {
    e.preventDefault()
    if (!user) return
    try {
      setUploading(true)
      const imageInput = e.currentTarget.elements.namedItem('imageFile')?.files?.[0]
      const imageUrl = imageInput ? await uploadImage(imageInput) : newsForm.imageUrl.trim()

      await addDoc(collection(db, 'news'), {
        title: newsForm.title.trim(),
        publishedAt: newsForm.publishedAt,
        content: newsForm.content.trim(),
        imageUrl,
        createdAt: serverTimestamp(),
        authorUid: user.uid,
      })

      setNewsForm(initialNewsForm)
      e.currentTarget.reset()
    } finally {
      setUploading(false)
    }
  }

  async function saveCertificate(e) {
    e.preventDefault()
    if (!user) return
    try {
      setUploading(true)
      const pdfFile = e.currentTarget.elements.namedItem('pdfFile')?.files?.[0]
      let pdfUrl = certForm.pdfUrl.trim()
      if (pdfFile) {
        const safeName = pdfFile.name.replace(/[^\w.-]+/g, '_')
        const path = `certificates/${normalizeId(certForm.nit)}_${Date.now()}_${safeName}`
        const storageRef = ref(storage, path)
        await uploadBytes(storageRef, pdfFile)
        pdfUrl = await getDownloadURL(storageRef)
      }

      const certId = normalizeId(certForm.qrCodeId || certForm.nit)

      await setDoc(doc(db, 'certificates_public', normalizeId(certForm.nit)), {
        nit: normalizeId(certForm.nit),
        name: certForm.name.trim(),
        issueDate: certForm.issueDate,
        expiryDate: certForm.expiryDate,
        status: isExpired(certForm.expiryDate) ? 'Vencido' : 'Vigente',
        pdfUrl,
        qrCodeId: certId,
        updatedAt: serverTimestamp(),
      })

      setCertForm(initialCertForm)
      e.currentTarget.reset()
      alert('Certificado guardado correctamente.')
    } finally {
      setUploading(false)
    }
  }

  async function lookupCertificate(valueOverride) {
    const value = normalizeId(valueOverride || searchValue)
    if (!value) return
    setSearchState('loading')
    setSearchResult(null)
    try {
      let snapshot = await getDoc(doc(db, 'certificates_public', value))
      if (!snapshot.exists()) {
        const q = query(collection(db, 'certificates_public'), where('nit', '==', value))
        const qs = await getDocs(q)
        snapshot = qs.docs[0] || null
      }

      if (!snapshot || !snapshot.exists()) {
        setSearchResult(null)
        setSearchState('not-found')
        return
      }

      const data = snapshot.data()
      setSearchResult({
        id: snapshot.id,
        ...data,
        status: data.status || (isExpired(data.expiryDate) ? 'Vencido' : 'Vigente'),
      })
      setSearchState('found')
    } catch {
      setSearchState('error')
    }
  }

  async function submitInspectionRequest(e) {
    e.preventDefault()
    const payload = {
      ...requestForm,
      createdAt: serverTimestamp(),
      source: 'web',
    }

    await addDoc(collection(db, 'inspection_requests'), payload)

    const whatsappText = encodeWhatsAppMessage(requestForm)
    const url = `https://wa.me/${BRAND.whatsappPhone}?text=${whatsappText}`
    window.open(url, '_blank', 'noopener,noreferrer')
    setRequestForm({
      name: '',
      nit: '',
      contactName: '',
      phone: '',
      address: '',
      activity: '',
      observation: '',
    })
  }

  const qrValue = searchResult
    ? `${verificationBaseUrl}?cert=${encodeURIComponent(searchResult.nit || searchResult.id)}`
    : `${verificationBaseUrl}?cert=CONSULTA`

  return (
    <div className="site-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Institucional · Emergencia · Servicio público</p>
          <h1>{BRAND.name}</h1>
        </div>
        <nav className="topnav" aria-label="Principal">
          <a href="#inicio">Inicio</a>
          <a href="#noticias">Noticias</a>
          <a href="#certificados">Certificados</a>
          <a href="#contacto">Contacto</a>
        </nav>
      </header>

      <section id="inicio" className="hero card">
        <div className="hero-copy">
          <span className="badge">Cobertura operativa en Cubarral, Meta</span>
          <h2>Protección, respuesta y atención confiable para la comunidad</h2>
          <p>
            Plataforma institucional diseñada para informar, verificar certificados, publicar
            comunicados oficiales y facilitar el acceso rápido a los canales de emergencia.
          </p>
          <div className="hero-actions">
            <a className="btn primary" href={`tel:${BRAND.emergencyPhone}`}>Línea de emergencia</a>
            <a className="btn ghost" href={`https://wa.me/${BRAND.whatsappPhone}`} target="_blank" rel="noreferrer">
              WhatsApp institucional
            </a>
          </div>
        </div>
        <div className="hero-panel">
          <div className="status-card">
            <strong>Visión</strong>
            <p>Ser una institución moderna, cercana y tecnológicamente preparada para servir mejor.</p>
          </div>
          <div className="status-card">
            <strong>Misión</strong>
            <p>Salvaguardar vidas, bienes y el entorno mediante atención oportuna, prevención y educación.</p>
          </div>
        </div>
      </section>

      <section className="grid-4">
        <article className="card info-card">
          <h3>Historia</h3>
          <p>
            Espacio institucional para narrar el origen, evolución y compromiso del cuerpo de
            bomberos con el municipio.
          </p>
        </article>
        <article className="card info-card">
          <h3>Servicios</h3>
          <p>Atención de emergencias, prevención, inspecciones de seguridad, apoyo comunitario y capacitación.</p>
        </article>
        <article className="card info-card">
          <h3>Cobertura operativa</h3>
          <p>Respuesta en el casco urbano, zona rural y apoyos interinstitucionales según la emergencia.</p>
        </article>
        <article className="card info-card">
          <h3>Transparencia</h3>
          <p>Noticias, certificaciones y trámites con información clara, verificable y fácil de consultar.</p>
        </article>
      </section>

      <section id="noticias" className="card section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Noticias y comunicados</p>
            <h2>Publicaciones oficiales</h2>
          </div>
          <button className="btn dark" onClick={() => setAuthMode((v) => !v)}>
            {user ? 'Administración' : 'Ingresar administración'}
          </button>
        </div>

        {authMode && !user && (
          <form className="panel auth-panel" onSubmit={handleLogin}>
            <h3>Acceso de administradores</h3>
            <input
              type="email"
              placeholder="Correo institucional"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Contraseña"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              required
            />
            {authError && <p className="error">{authError}</p>}
            <button className="btn primary" type="submit">Entrar</button>
          </form>
        )}

        {user && (
          <div className="admin-layout">
            <div className="panel">
              <div className="panel-head">
                <h3>Panel administrativo</h3>
                <button className="btn subtle" onClick={handleLogout}>Cerrar sesión</button>
              </div>

              <form className="admin-form" onSubmit={saveNews}>
                <h4>Publicar noticia</h4>
                <input
                  type="text"
                  placeholder="Título"
                  value={newsForm.title}
                  onChange={(e) => setNewsForm((v) => ({ ...v, title: e.target.value }))}
                  required
                />
                <input
                  type="date"
                  value={newsForm.publishedAt}
                  onChange={(e) => setNewsForm((v) => ({ ...v, publishedAt: e.target.value }))}
                  required
                />
                <input
                  type="url"
                  placeholder="URL de imagen (opcional)"
                  value={newsForm.imageUrl}
                  onChange={(e) => setNewsForm((v) => ({ ...v, imageUrl: e.target.value }))}
                />
                <input type="file" name="imageFile" accept="image/*" />
                <textarea
                  placeholder="Contenido"
                  rows="5"
                  value={newsForm.content}
                  onChange={(e) => setNewsForm((v) => ({ ...v, content: e.target.value }))}
                  required
                />
                <button className="btn primary" type="submit" disabled={uploading}>
                  {uploading ? 'Guardando...' : 'Publicar'}
                </button>
              </form>
            </div>

            <div className="panel">
              <form className="admin-form" onSubmit={saveCertificate}>
                <h4>Registrar o actualizar certificado</h4>
                <input
                  type="text"
                  placeholder="NIT o identificación"
                  value={certForm.nit}
                  onChange={(e) => setCertForm((v) => ({ ...v, nit: e.target.value }))}
                  required
                />
                <input
                  type="text"
                  placeholder="Nombre del establecimiento"
                  value={certForm.name}
                  onChange={(e) => setCertForm((v) => ({ ...v, name: e.target.value }))}
                  required
                />
                <div className="two-col">
                  <input
                    type="date"
                    value={certForm.issueDate}
                    onChange={(e) => setCertForm((v) => ({ ...v, issueDate: e.target.value }))}
                    required
                  />
                  <input
                    type="date"
                    value={certForm.expiryDate}
                    onChange={(e) => setCertForm((v) => ({ ...v, expiryDate: e.target.value }))}
                    required
                  />
                </div>
                <input
                  type="url"
                  placeholder="URL del PDF (opcional si subes archivo)"
                  value={certForm.pdfUrl}
                  onChange={(e) => setCertForm((v) => ({ ...v, pdfUrl: e.target.value }))}
                />
                <input type="file" name="pdfFile" accept="application/pdf" />
                <input
                  type="text"
                  placeholder="ID para el QR de validación (opcional)"
                  value={certForm.qrCodeId}
                  onChange={(e) => setCertForm((v) => ({ ...v, qrCodeId: e.target.value }))}
                />
                <button className="btn primary" type="submit" disabled={uploading}>
                  {uploading ? 'Procesando...' : 'Guardar certificado'}
                </button>
              </form>
            </div>
          </div>
        )}

        <div className="news-grid">
          {loadingNews && <p>Cargando noticias...</p>}
          {!loadingNews && news.length === 0 && <p>Aún no hay noticias publicadas.</p>}
          {news.map((item) => (
            <article className="news-card" key={item.id}>
              {item.imageUrl ? <img src={item.imageUrl} alt={item.title} /> : null}
              <div className="news-content">
                <span className="news-date">{formatDate(item.publishedAt)}</span>
                <h3>{item.title}</h3>
                <p>{item.content}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="certificados" className="card section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Verificación digital</p>
            <h2>Consulta de certificados de seguridad</h2>
          </div>
        </div>

        <div className="verify-grid">
          <div className="panel">
            <h3>Consultar por NIT o identificación</h3>
            <div className="search-row">
              <input
                type="text"
                placeholder="Ingresa el NIT o identificación"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && lookupCertificate()}
              />
              <button className="btn primary" onClick={() => lookupCertificate()}>
                Verificar
              </button>
            </div>

            {searchState === 'loading' && <p>Buscando certificado...</p>}
            {searchState === 'error' && <p className="error">Ocurrió un error al consultar la información.</p>}

            {searchResult && (
              <div className={`certificate-result ${searchResult.status === 'Vencido' ? 'expired' : 'valid'}`}>
                <div className="certificate-head">
                  <div>
                    <h3>{searchResult.name}</h3>
                    <p>NIT: {searchResult.nit}</p>
                  </div>
                  <span className="state-pill">{searchResult.status}</span>
                </div>

                <div className="certificate-meta">
                  <p><strong>Expedición:</strong> {formatDate(searchResult.issueDate)}</p>
                  <p><strong>Vencimiento:</strong> {formatDate(searchResult.expiryDate)}</p>
                </div>

                <div className="qr-row">
                  <QRCodeCanvas value={qrValue} size={132} includeMargin />
                  <div>
                    <p className="muted">Código QR de validación</p>
                    <a className="btn ghost" href={qrValue} target="_blank" rel="noreferrer">
                      Abrir página oficial
                    </a>
                  </div>
                </div>

                {searchResult.pdfUrl && (
                  <a className="btn primary" href={searchResult.pdfUrl} target="_blank" rel="noreferrer">
                    Descargar certificado PDF
                  </a>
                )}

                {searchResult.status === 'Vencido' && (
                  <div className="alert">
                    Este certificado está vencido y requiere renovación.
                  </div>
                )}
              </div>
            )}

            {searchState === 'not-found' && (
              <div className="alert soft">
                No se encontró el establecimiento. Completa la solicitud de inspección para agendar visita técnica.
              </div>
            )}
          </div>

          <div className="panel">
            <h3>Solicitud de inspección o certificación</h3>
            <form className="admin-form" onSubmit={submitInspectionRequest}>
              <input
                type="text"
                placeholder="Nombre del establecimiento"
                value={requestForm.name}
                onChange={(e) => setRequestForm((v) => ({ ...v, name: e.target.value }))}
                required
              />
              <input
                type="text"
                placeholder="NIT / identificación"
                value={requestForm.nit}
                onChange={(e) => setRequestForm((v) => ({ ...v, nit: e.target.value }))}
                required
              />
              <input
                type="text"
                placeholder="Nombre de contacto"
                value={requestForm.contactName}
                onChange={(e) => setRequestForm((v) => ({ ...v, contactName: e.target.value }))}
                required
              />
              <input
                type="tel"
                placeholder="Teléfono"
                value={requestForm.phone}
                onChange={(e) => setRequestForm((v) => ({ ...v, phone: e.target.value }))}
                required
              />
              <input
                type="text"
                placeholder="Dirección"
                value={requestForm.address}
                onChange={(e) => setRequestForm((v) => ({ ...v, address: e.target.value }))}
                required
              />
              <input
                type="text"
                placeholder="Actividad comercial"
                value={requestForm.activity}
                onChange={(e) => setRequestForm((v) => ({ ...v, activity: e.target.value }))}
              />
              <textarea
                rows="4"
                placeholder="Observaciones"
                value={requestForm.observation}
                onChange={(e) => setRequestForm((v) => ({ ...v, observation: e.target.value }))}
              />
              <button className="btn primary" type="submit">
                Enviar por WhatsApp
              </button>
            </form>
          </div>
        </div>
      </section>

      <section id="contacto" className="card section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Accesos rápidos permanentes</p>
            <h2>Canales institucionales</h2>
          </div>
        </div>

        <div className="contacts-grid">
          <a className="contact-box" href={`tel:${BRAND.emergencyPhone}`}>
            <strong>Línea de emergencia</strong>
            <span>{BRAND.emergencyPhone}</span>
          </a>
          <a className="contact-box" href={`https://wa.me/${BRAND.whatsappPhone}`} target="_blank" rel="noreferrer">
            <strong>WhatsApp institucional</strong>
            <span>{BRAND.whatsappDisplay}</span>
          </a>
          <a className="contact-box" href={BRAND.facebook} target="_blank" rel="noreferrer">
            <strong>Facebook</strong>
            <span>Cuenta oficial</span>
          </a>
          <a className="contact-box" href={BRAND.instagram} target="_blank" rel="noreferrer">
            <strong>Instagram</strong>
            <span>Cuenta oficial</span>
          </a>
        </div>

        <div className="footer-note">
          <p><strong>Ubicación:</strong> {BRAND.address}</p>
          <p>Preparado para ampliaciones futuras: directorio de emergencias, PQR, transparencia, gestión documental y capacitaciones.</p>
        </div>
      </section>

      <div className="floating-actions" aria-label="Accesos rápidos">
        <a href={`tel:${BRAND.emergencyPhone}`} title="Línea de emergencia">🚨</a>
        <a href={`https://wa.me/${BRAND.whatsappPhone}`} target="_blank" rel="noreferrer" title="WhatsApp">💬</a>
        <a href={BRAND.facebook} target="_blank" rel="noreferrer" title="Facebook">f</a>
        <a href="#certificados" title="Verificación">✓</a>
      </div>
    </div>
  )
}
