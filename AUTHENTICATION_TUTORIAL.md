# Tutorial Completo: Sistema de Autenticação com Next.js

## Índice
1. [Configuração Inicial](#configuração-inicial)
2. [Sistema de Autenticação Local com SQL](#sistema-de-autenticação-local-com-sql)
3. [Migração para Supabase](#migração-para-supabase)
4. [Componentes e Hooks](#componentes-e-hooks)
5. [Proteção de Rotas](#proteção-de-rotas)
6. [Deploy e Configuração](#deploy-e-configuração)

---

## 1. Configuração Inicial

### 1.1 Instalar Dependências

```bash
# Dependências para autenticação local
npm install bcryptjs jsonwebtoken sqlite3
npm install @types/bcryptjs @types/jsonwebtoken @types/sqlite3 --save-dev

# Dependências para Supabase (já instaladas)
npm install @supabase/supabase-js

# Dependências para formulários e validação
npm install react-hook-form zod @hookform/resolvers
npm install @radix-ui/react-slot @radix-ui/react-label
npm install class-variance-authority clsx tailwind-merge
```

### 1.2 Estrutura de Pastas

```
src/
├── app/
│   ├── auth/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── register/
│   │   │   └── page.tsx
│   │   └── logout/
│   │       └── page.tsx
│   ├── dashboard/
│   │   └── page.tsx
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/
│   │   │   │   └── route.ts
│   │   │   ├── register/
│   │   │   │   └── route.ts
│   │   │   └── logout/
│   │   │       └── route.ts
│   │   └── users/
│   │       └── route.ts
│   └── layout.tsx
├── components/
│   ├── ui/
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── label.tsx
│   │   └── card.tsx
│   ├── auth/
│   │   ├── login-form.tsx
│   │   └── register-form.tsx
│   └── layout/
│       ├── header.tsx
│       └── sidebar.tsx
├── lib/
│   ├── auth.ts
│   ├── database.ts
│   ├── supabase.ts
│   └── utils.ts
├── hooks/
│   └── use-auth.ts
└── types/
    └── auth.ts
```

---

## 2. Sistema de Autenticação Local com SQL

### 2.1 Configurar Banco de Dados SQLite

**`src/lib/database.ts`**
```typescript
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';

let db: Database | null = null;

export async function getDatabase(): Promise<Database> {
  if (db) return db;
  
  db = await open({
    filename: path.join(process.cwd(), 'database.sqlite'),
    driver: sqlite3.Database
  });

  // Criar tabela de usuários
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  return db;
}

export async function closeDatabase() {
  if (db) {
    await db.close();
    db = null;
  }
}
```

### 2.2 Configurar Autenticação Local

**`src/lib/auth.ts`**
```typescript
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDatabase } from './database';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export interface User {
  id: number;
  email: string;
  name: string;
  created_at: string;
}

export interface UserWithPassword extends User {
  password: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export function generateToken(user: User): string {
  return jwt.sign(
    { userId: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

export async function createUser(email: string, password: string, name: string): Promise<User> {
  const db = await getDatabase();
  const hashedPassword = await hashPassword(password);
  
  const result = await db.run(
    'INSERT INTO users (email, password, name) VALUES (?, ?, ?)',
    [email, hashedPassword, name]
  );

  return {
    id: result.lastID!,
    email,
    name,
    created_at: new Date().toISOString()
  };
}

export async function findUserByEmail(email: string): Promise<UserWithPassword | null> {
  const db = await getDatabase();
  const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
  return user || null;
}

export async function findUserById(id: number): Promise<User | null> {
  const db = await getDatabase();
  const user = await db.get('SELECT id, email, name, created_at FROM users WHERE id = ?', [id]);
  return user || null;
}
```

### 2.3 API Routes para Autenticação

**`src/app/api/auth/register/route.ts`**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createUser, findUserByEmail } from '@/lib/auth';
import { z } from 'zod';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2)
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name } = registerSchema.parse(body);

    // Verificar se usuário já existe
    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return NextResponse.json(
        { error: 'Usuário já existe' },
        { status: 400 }
      );
    }

    // Criar usuário
    const user = await createUser(email, password, name);
    
    return NextResponse.json({
      message: 'Usuário criado com sucesso',
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });

  } catch (error) {
    console.error('Erro no registro:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
```

**`src/app/api/auth/login/route.ts`**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { findUserByEmail, verifyPassword, generateToken } from '@/lib/auth';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = loginSchema.parse(body);

    // Buscar usuário
    const user = await findUserByEmail(email);
    if (!user) {
      return NextResponse.json(
        { error: 'Credenciais inválidas' },
        { status: 401 }
      );
    }

    // Verificar senha
    const isValidPassword = await verifyPassword(password, user.password);
    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Credenciais inválidas' },
        { status: 401 }
      );
    }

    // Gerar token
    const token = generateToken(user);

    // Configurar cookie
    const response = NextResponse.json({
      message: 'Login realizado com sucesso',
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });

    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 // 7 dias
    });

    return response;

  } catch (error) {
    console.error('Erro no login:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
```

**`src/app/api/auth/logout/route.ts`**
```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ message: 'Logout realizado com sucesso' });
  
  response.cookies.set('auth-token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0
  });

  return response;
}
```

### 2.4 Middleware para Proteção de Rotas

**`src/middleware.ts`**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('auth-token')?.value;
  const isAuthPage = request.nextUrl.pathname.startsWith('/auth');
  const isApiAuthRoute = request.nextUrl.pathname.startsWith('/api/auth');

  // Rotas de API de autenticação não precisam de verificação
  if (isApiAuthRoute) {
    return NextResponse.next();
  }

  // Se não há token e não é página de auth, redirecionar para login
  if (!token && !isAuthPage) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  // Se há token e é página de auth, redirecionar para dashboard
  if (token && isAuthPage) {
    const decoded = verifyToken(token);
    if (decoded) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // Se há token mas é inválido, limpar cookie e redirecionar
  if (token && !isAuthPage) {
    const decoded = verifyToken(token);
    if (!decoded) {
      const response = NextResponse.redirect(new URL('/auth/login', request.url));
      response.cookies.set('auth-token', '', { maxAge: 0 });
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/auth/:path*',
    '/api/auth/:path*'
  ]
};
```

---

## 3. Migração para Supabase

### 3.1 Configurar Supabase

**`src/lib/supabase.ts`**
```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Tipos para Supabase
export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
}
```

### 3.2 SQL para Criar Tabela no Supabase

```sql
-- Criar tabela de usuários
CREATE TABLE users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Política para usuários verem apenas seus próprios dados
CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (auth.uid()::text = id::text);

-- Política para usuários atualizarem apenas seus próprios dados
CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (auth.uid()::text = id::text);

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc'::text, NOW());
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para atualizar updated_at automaticamente
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### 3.3 Autenticação com Supabase

**`src/lib/auth-supabase.ts`**
```typescript
import { supabase } from './supabase';
import { User } from '@supabase/supabase-js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  created_at: string;
}

export async function signUp(email: string, password: string, name: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name
      }
    }
  });

  if (error) throw error;

  // Criar perfil do usuário
  if (data.user) {
    const { error: profileError } = await supabase
      .from('users')
      .insert({
        id: data.user.id,
        email: data.user.email!,
        name
      });

    if (profileError) throw profileError;
  }

  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser(): Promise<User | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getUserProfile(userId: string): Promise<AuthUser | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) return null;
  return data;
}

// Listener para mudanças de autenticação
export function onAuthStateChange(callback: (user: User | null) => void) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user ?? null);
  });
}
```

### 3.4 API Routes com Supabase

**`src/app/api/auth/supabase/register/route.ts`**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { signUp } from '@/lib/auth-supabase';
import { z } from 'zod';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2)
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name } = registerSchema.parse(body);

    const data = await signUp(email, password, name);

    return NextResponse.json({
      message: 'Usuário criado com sucesso',
      user: data.user
    });

  } catch (error: any) {
    console.error('Erro no registro:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }
}
```

**`src/app/api/auth/supabase/login/route.ts`**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { signIn } from '@/lib/auth-supabase';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = loginSchema.parse(body);

    const data = await signIn(email, password);

    return NextResponse.json({
      message: 'Login realizado com sucesso',
      user: data.user
    });

  } catch (error: any) {
    console.error('Erro no login:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }
}
```

---

## 4. Componentes e Hooks

### 4.1 Hook de Autenticação

**`src/hooks/use-auth.ts`**
```typescript
import { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { getCurrentUser, onAuthStateChange } from '@/lib/auth-supabase';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verificar usuário atual
    getCurrentUser().then((user) => {
      setUser(user);
      setLoading(false);
    });

    // Listener para mudanças
    const { data: { subscription } } = onAuthStateChange((user) => {
      setUser(user);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, loading };
}
```

### 4.2 Componentes UI

**`src/components/ui/button.tsx`**
```typescript
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline: "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
```

**`src/components/ui/input.tsx`**
```typescript
import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
```

### 4.3 Formulários de Autenticação

**`src/components/auth/login-form.tsx`**
```typescript
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { signIn } from '@/lib/auth-supabase';
import { useRouter } from 'next/navigation';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres')
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema)
  });

  const onSubmit = async (data: LoginForm) => {
    try {
      setLoading(true);
      setError('');
      await signIn(data.email, data.password);
      router.push('/dashboard');
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {error && (
        <div className="p-3 text-sm text-red-500 bg-red-50 rounded-md">
          {error}
        </div>
      )}
      
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1">
          Email
        </label>
        <Input
          id="email"
          type="email"
          {...register('email')}
          className={errors.email ? 'border-red-500' : ''}
        />
        {errors.email && (
          <p className="text-sm text-red-500 mt-1">{errors.email.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-1">
          Senha
        </label>
        <Input
          id="password"
          type="password"
          {...register('password')}
          className={errors.password ? 'border-red-500' : ''}
        />
        {errors.password && (
          <p className="text-sm text-red-500 mt-1">{errors.password.message}</p>
        )}
      </div>

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Entrando...' : 'Entrar'}
      </Button>
    </form>
  );
}
```

---

## 5. Proteção de Rotas

### 5.1 Componente de Proteção

**`src/components/auth/protected-route.tsx`**
```typescript
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
```

### 5.2 Layout Protegido

**`src/app/dashboard/layout.tsx`**
```typescript
import { ProtectedRoute } from '@/components/auth/protected-route';
import { Header } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex">
          <Sidebar />
          <main className="flex-1 p-6">
            {children}
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
```

---

## 6. Deploy e Configuração

### 6.1 Variáveis de Ambiente

**`.env.local`**
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=sua_url_do_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anonima_do_supabase

# JWT (para autenticação local)
JWT_SECRET=sua_chave_secreta_jwt

# Database (para autenticação local)
DATABASE_URL=file:./database.sqlite
```

### 6.2 Scripts de Migração

**`scripts/migrate-to-supabase.js`**
```javascript
const { createClient } = require('@supabase/supabase-js');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcryptjs');

async function migrateUsers() {
  // Conectar ao SQLite
  const db = await open({
    filename: './database.sqlite',
    driver: sqlite3.Database
  });

  // Conectar ao Supabase
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Buscar todos os usuários do SQLite
  const users = await db.all('SELECT * FROM users');

  for (const user of users) {
    try {
      // Criar usuário no Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: user.email,
        password: 'temp-password-123', // Usuário precisará redefinir
        email_confirm: true,
        user_metadata: {
          name: user.name
        }
      });

      if (authError) {
        console.error(`Erro ao criar usuário ${user.email}:`, authError);
        continue;
      }

      // Criar perfil do usuário
      const { error: profileError } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          email: user.email,
          name: user.name,
          created_at: user.created_at
        });

      if (profileError) {
        console.error(`Erro ao criar perfil para ${user.email}:`, profileError);
      } else {
        console.log(`Usuário ${user.email} migrado com sucesso`);
      }

    } catch (error) {
      console.error(`Erro ao migrar usuário ${user.email}:`, error);
    }
  }

  await db.close();
  console.log('Migração concluída!');
}

migrateUsers().catch(console.error);
```

### 6.3 Deploy no Vercel

1. **Conectar repositório ao Vercel**
2. **Configurar variáveis de ambiente**
3. **Deploy automático**

**`vercel.json`**
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs",
  "installCommand": "npm install"
}
```

---

## 7. Testes

### 7.1 Testes de Autenticação

**`__tests__/auth.test.ts`**
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createUser, findUserByEmail, verifyPassword } from '@/lib/auth';
import { getDatabase, closeDatabase } from '@/lib/database';

describe('Authentication', () => {
  beforeAll(async () => {
    await getDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('should create a new user', async () => {
    const user = await createUser('test@example.com', 'password123', 'Test User');
    
    expect(user).toBeDefined();
    expect(user.email).toBe('test@example.com');
    expect(user.name).toBe('Test User');
  });

  it('should find user by email', async () => {
    const user = await findUserByEmail('test@example.com');
    
    expect(user).toBeDefined();
    expect(user?.email).toBe('test@example.com');
  });

  it('should verify password correctly', async () => {
    const user = await findUserByEmail('test@example.com');
    const isValid = await verifyPassword('password123', user!.password);
    
    expect(isValid).toBe(true);
  });
});
```

---

## 8. Próximos Passos

1. **Implementar recuperação de senha**
2. **Adicionar autenticação social (Google, GitHub)**
3. **Implementar verificação de email**
4. **Adicionar logs de auditoria**
5. **Implementar rate limiting**
6. **Adicionar testes E2E**

---

## Conclusão

Este tutorial fornece uma implementação completa de autenticação com Next.js, incluindo:

- ✅ Autenticação local com SQLite e JWT
- ✅ Migração para Supabase
- ✅ Proteção de rotas
- ✅ Componentes reutilizáveis
- ✅ Validação de formulários
- ✅ Hooks personalizados
- ✅ Scripts de migração
- ✅ Configuração de deploy

O sistema é escalável e pode ser facilmente adaptado para diferentes necessidades de negócio. 