import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Login from "./Login";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is already authenticated
    const auth = localStorage.getItem("dfir_auth");
    if (auth) {
      navigate("/dashboard");
    }
  }, [navigate]);

  return <Login />;
};

export default Index;
