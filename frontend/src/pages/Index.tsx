import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { isSessionValid } from "@/lib/auth";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (isSessionValid()) {
      window.location.href = "/dashboard";
    } else {
      window.location.href = "/login";
    }
  }, []);

  return null;
};

export default Index;
