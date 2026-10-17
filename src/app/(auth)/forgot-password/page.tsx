import type { Metadata } from "next";
import { ForgotForm } from "./ForgotForm";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPage() {
  return (
    <>
      <h1 className="auth-title">Reset your password</h1>
      <p className="auth-sub">Enter your work email and we will send a link to choose a new password.</p>
      <ForgotForm />
    </>
  );
}
