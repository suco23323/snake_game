import './ConfigurationPage.css';

export function ConfigurationPage() {
  return (
    <section className="configuration-page">
      <div className="configuration-card">
        <span className="configuration-icon">⚙️</span>
        <h1>需要配置 Supabase</h1>
        <p>
          请在项目根目录创建 <code>.env.local</code>，然后填入下面的变量并重启开发服务器。
        </p>
        <pre>{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key`}</pre>
        <p className="configuration-note">
          然后在 Supabase SQL Editor 中运行 <code>scripts/init.sql</code>。
        </p>
      </div>
    </section>
  );
}
