const SLIDES = [
  {
    url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBuPUyW-yEiuHb9-uKpcbxXDg2RHCoo5k_eXAxU5f28ME6UHFXHR-anT3kE8152uHMFF1Fh28YoNesu5gfRCYlqfDQvdxOoj8LHnbhPYdM1yq6g8SF6xGdoaFDePPq9NPLzSE1-M4rXMs00uiEvojtJGFM7R4wVJBIUs7SApeZtGJybLuZxApdHoI2x3Ud3KKiu4vEwEEg0PXvZL3eDvZ-exaWtueGIVH_bv7pAeGRTlsP8NSBBnSV2Oc2CNPgCDvwSlz0',
    alt: 'Templo griego'
  },
  {
    url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDDmgp-yAYGMGncMJ-3qU-49FQ3IuWl7vtf6pLsrG3ssQDgxv3_Km3SxquMmcaySojqZUzWldM6klZwGkMu-2X0_8nRyPmqcK6hj-4lEkSkHe1WfR8hG15TqBXSMWLWT9Hpo3woDNvXhbs8jL566zsX3IZITN9ij6y7KEnV6wEoYaxkb8GMfYT0jneeaUPMFcHAYETDiuf3uEE0vG10d3N000O374Z2TKneLPCbrmtMtkeAyIaGM23IA0Y6i-_e7Zk-4T8',
    alt: 'Piedra antigua'
  },
  {
    url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAr2ml4-SATbvQDs_jDRpPfnNtXKr7WYke--s8oiYraCy17pMxcDJbIJHxZ7JRXfAVvyvkEJQD_qXNCgNPwfgWzMRCwT32Ywhmr7PkSbsjJhMqJ2HkX4OOFaxCED3cDbgUK-f8mgWAx3jFQpGoi160avz7ObsQWDaXBMRoOwv2p1rXGcbSjIExEH25xHt14YxG0UsP4o_IGS5vrDH4KRvpuPT1OCeyoZzcFwou_vgsDK8aImmws8nRpgM73vUrBQG6pUkc',
    alt: 'Atleta griego'
  }
];

interface BackgroundSliderProps {
  className?: string;
}

export function BackgroundSlider({ className = '' }: BackgroundSliderProps) {
  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 pointer-events-none z-0 overflow-hidden ${className}`}
    >
      <div
        className="bg-slide-1 absolute inset-0 bg-cover bg-center transition-transform duration-[7000ms]"
        style={{
          backgroundImage: `url("${SLIDES[0].url}")`,
          filter: 'contrast(108%) brightness(100%) saturate(0.85)'
        }}
      />
      <div
        className="bg-slide-2 absolute inset-0 bg-cover bg-center transition-transform duration-[7000ms]"
        style={{
          backgroundImage: `url("${SLIDES[1].url}")`,
          filter: 'contrast(108%) brightness(100%) saturate(0.85)'
        }}
      />
      <div
        className="bg-slide-3 absolute inset-0 bg-cover bg-center transition-transform duration-[7000ms]"
        style={{
          backgroundImage: `url("${SLIDES[2].url}")`,
          filter: 'contrast(108%) brightness(100%) saturate(0.85)'
        }}
      />
      {/* Temple Veil Overlay — reduced opacity so backgrounds show through */}
      <div className="absolute inset-0 backdrop-blur-[2px] transition-colors duration-500 bg-[var(--veil-color)] opacity-40" />
      <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)]/80 via-transparent to-[var(--bg)]/30 opacity-50" />
    </div>
  );
}
