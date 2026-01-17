import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Login from "./Login";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const auth = localStorage.getItem("dfir_auth");
    if (auth) {
      navigate("/dashboard");
      return;
    }
    navigate("/login");
  }, [navigate]);

  return <Login />;
};

export default Index;
