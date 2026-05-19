import { Link, useSearchParams } from 'react-router-dom';

const LegalLayout = ({ title, children }) => {
  const [searchParams] = useSearchParams();
  const tenantSlug = searchParams.get('tenant') || 'kainlowkal';
  const homeLink = '/';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 p-8 md:p-20 font-sans leading-relaxed">
      <div className="max-w-3xl mx-auto">
        <Link to={homeLink} className="inline-block mb-12 text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-widest text-sm transition-all hover:-translate-x-2">
          ← Back to Home
        </Link>
        <h1 className="text-4xl md:text-5xl font-black text-white mb-8 tracking-tight uppercase">{title}</h1>
        <div className="bg-slate-900/50 border border-white/10 rounded-[40px] p-8 md:p-12 backdrop-blur-xl shadow-2xl">
          {children}
        </div>
        <footer className="mt-12 text-slate-600 text-sm border-t border-white/5 pt-8">
          <p>&copy; {new Date().getFullYear()} ELEVATEPOS System. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
};

export const PrivacyPolicy = () => (
  <LegalLayout title="Privacy Policy">
    <div className="space-y-6">
      <p>Your privacy is important to us. This Privacy Policy explains how ELEVATEPOS collects, uses, and protects your personal information when you use our multi-tenant POS platform.</p>
      
      <section>
        <h2 className="text-white font-bold text-xl mb-3">1. Information We Collect</h2>
        <p>When you log in via Facebook or Google, we collect your name and email address. We do not collect or store your social media passwords.</p>
      </section>

      <section>
        <h2 className="text-white font-bold text-xl mb-3">2. How We Use Information</h2>
        <p>We use your information to manage your loyalty points, track your order history, and provide a personalized experience for the specific store you are visiting.</p>
      </section>

      <section>
        <h2 className="text-white font-bold text-xl mb-3">3. Data Security</h2>
        <p>We implement industry-standard security measures to protect your data from unauthorized access or disclosure.</p>
      </section>

      <section>
        <h2 className="text-white font-bold text-xl mb-3">4. Third-Party Services</h2>
        <p>We use Facebook and Google for authentication purposes. Please refer to their respective privacy policies for how they handle your data.</p>
      </section>
    </div>
  </LegalLayout>
);

export const TermsOfService = () => (
  <LegalLayout title="Terms of Service">
    <div className="space-y-6">
      <p>By using the ELEVATEPOS system, you agree to comply with and be bound by the following terms and conditions.</p>
      
      <section>
        <h2 className="text-white font-bold text-xl mb-3">1. User Eligibility</h2>
        <p>You must be at least 13 years old to use this service. By creating an account, you represent that you meet this requirement.</p>
      </section>

      <section>
        <h2 className="text-white font-bold text-xl mb-3">2. Account Responsibility</h2>
        <p>You are responsible for maintaining the confidentiality of your account and for all activities that occur under your account.</p>
      </section>

      <section>
        <h2 className="text-white font-bold text-xl mb-3">3. Prohibited Use</h2>
        <p>You agree not to use the system for any illegal activities or to attempt to disrupt the service for other users.</p>
      </section>

      <section>
        <h2 className="text-white font-bold text-xl mb-3">4. Limitation of Liability</h2>
        <p>ELEVATEPOS is provided "as is" and we are not liable for any damages resulting from the use or inability to use our platform.</p>
      </section>
    </div>
  </LegalLayout>
);

export const DataDeletion = () => (
  <LegalLayout title="Store Conditions">
    <div className="space-y-6">
      <p>We respect your right to control your personal data. If you wish to delete your ELEVATEPOS account and all associated data, please follow these instructions:</p>
      
      <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
        <h3 className="text-white font-bold mb-4">Steps to Request Deletion:</h3>
        <ol className="list-decimal list-inside space-y-4 text-slate-300">
          <li>Send an email to <span className="text-indigo-400 font-bold">jasonanthonytrillo@gmail.com</span>.</li>
          <li>Subject line should be: <span className="italic">"Data Deletion Request - [Your Name]"</span>.</li>
          <li>Include the email address associated with your Facebook or Google account.</li>
          <li>Once received, we will process your request and permanently delete your account within 7 business days.</li>
        </ol>
      </div>

      <p className="text-sm text-slate-500 italic mt-8">Note: Once your account is deleted, all earned loyalty points and order history will be permanently lost and cannot be recovered.</p>
    </div>
  </LegalLayout>
);
