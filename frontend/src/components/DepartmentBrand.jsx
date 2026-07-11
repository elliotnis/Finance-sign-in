const BUSINESS_SCHOOL_LOGO = 'https://bm.hkust.edu.hk/themes/custom/sbm/images/logo-sbm-white.svg';

function DepartmentBrand({ subtitle }) {
  return (
    <div className="department-brand">
      <a
        className="department-brand-lockup"
        href="https://bm.hkust.edu.hk/"
        target="_blank"
        rel="noreferrer"
        aria-label="HKUST Business School"
      >
        <img src={BUSINESS_SCHOOL_LOGO} alt="HKUST Business School" />
      </a>
      <div className="department-brand-copy">
        <p>Department of Finance</p>
        <span>{subtitle}</span>
      </div>
    </div>
  );
}

export default DepartmentBrand;
