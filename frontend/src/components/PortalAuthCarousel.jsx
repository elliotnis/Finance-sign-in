import { useEffect, useState } from 'react';

const AUTO_ADVANCE_MS = 3000;

const SLIDES = [
  {
    src: 'https://bm.hkust.edu.hk/sites/default/files/2023-09/img_Finance.jpg',
    position: 'center center',
  },
  {
    src: 'https://bm.hkust.edu.hk/sites/default/files/inline-images/Advancing-Financial-Literacy-2.png',
    position: 'center center',
  },
  {
    src: 'https://hkust.edu.hk/sites/default/files/styles/hkust_standard_page_header/public/2025-08/Visit%20HKUST.jpg?itok=VFTxjKWp',
    position: 'center center',
  },
  {
    src: 'https://hkust.edu.hk/sites/default/files/styles/hkust_image_text_block/public/2026-06/DSC_8082-1-2.jpg?itok=eYu5ZFIC',
    position: 'center center',
  },
];

function PortalAuthCarousel() {
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActiveSlide((currentSlide) => (currentSlide + 1) % SLIDES.length);
    }, AUTO_ADVANCE_MS);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <div className="portal-auth-carousel-media" aria-hidden="true">
      {SLIDES.map((slide, index) => (
        <img
          className={`portal-auth-carousel-slide ${index === activeSlide ? 'active' : ''}`}
          key={slide.src}
          src={slide.src}
          alt=""
          fetchPriority={index === 0 ? 'high' : 'low'}
          style={{ objectPosition: slide.position }}
        />
      ))}
    </div>
  );
}

export default PortalAuthCarousel;
